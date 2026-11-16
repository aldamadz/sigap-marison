<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
umask(0077);
$configPath = $argv[1] ?? '';
$operation = $argv[2] ?? 'cycle';
if (!in_array($operation, ['cycle', 'snapshot', 'event'], true)) exit(1);
try {
    $config = json_decode((string)file_get_contents($configPath), true, 16, JSON_THROW_ON_ERROR);
    $lock = fopen(dirname($configPath) . '/cycle.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) exit(0);
    $command = [$config['node'], $config['runtime'], $operation, $configPath];
    if ($operation === 'event') {
        if (!isset($argv[3])) exit(1);
        $command[] = $argv[3];
        if (($argv[4] ?? '') === '--production') $command[] = '--production';
    }
    $process = proc_open($command, [STDIN, STDOUT, STDERR], $pipes);
    if (!is_resource($process)) exit(1);
    $deadline = microtime(true) + 50;
    do {
        $state = proc_get_status($process);
        if (!$state['running']) break;
        usleep(50000);
    } while (microtime(true) < $deadline);
    if ($state['running']) proc_terminate($process, 9);
    $exit = $state['running'] ? 1 : max(0, $state['exitcode']);
    proc_close($process);
    flock($lock, LOCK_UN);
    fclose($lock);
    exit($exit);
} catch (Throwable $error) { fwrite(STDERR, "Status cycle failed\n"); exit(1); }
