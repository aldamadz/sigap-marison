<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
umask(0077);

function command(array $args, string $input = ''): array {
    $process = proc_open($args, [['pipe','r'],['pipe','w'],['pipe','w']], $pipes);
    if (!is_resource($process)) throw new RuntimeException('Cannot start hosting command');
    fwrite($pipes[0], $input); fclose($pipes[0]);
    $out = stream_get_contents($pipes[1]); $error = stream_get_contents($pipes[2]);
    fclose($pipes[1]); fclose($pipes[2]);
    return [proc_close($process), $out, $error];
}

try {
    $home = realpath((string)getenv('HOME'));
    $private = $home . '/status-private';
    $configPath = $private . '/config.json';
    $config = json_decode((string)file_get_contents($configPath), true, 16, JSON_THROW_ON_ERROR);
    if ($config['origin'] !== 'https://status.marisoncloud.com' || !is_file($config['database'])
        || !str_starts_with(realpath($config['database']), $private . '/')
        || !str_starts_with(realpath($config['runtime']), $private . '/releases/')
        || dirname(realpath($config['runtime'])) !== __DIR__) throw new RuntimeException('Unsafe layout');
    $lock = fopen($private . '/cycle.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) throw new RuntimeException('Status operation already running');
    $operation = $argv[1] ?? '';
    $stamp = gmdate('Ymd-His') . '-' . bin2hex(random_bytes(4));
    if ($operation === 'web') {
        $web = $home . '/status.marisoncloud.com/public';
        if (realpath($web) !== $web || realpath($private) !== $private) throw new RuntimeException('Unexpected document root');
        $source = __DIR__ . '/public/index.php';
        $destination = $web . '/index.php';
        if (is_file($destination)) {
            if (!str_contains((string)file_get_contents($destination), 'Status gateway unavailable')) throw new RuntimeException('Unknown existing gateway');
            copy($destination, $private . '/index-' . $stamp . '.bak');
        }
        $htaccess = $web . '/.htaccess';
        $old = is_file($htaccess) ? (string)file_get_contents($htaccess) : '';
        file_put_contents($private . '/htaccess-' . $stamp . '.bak', $old, LOCK_EX);
        $new = preg_replace('/^# BEGIN SIGAP STATUS OPS16\n.*?^# END SIGAP STATUS OPS16\n?/ms', '', $old);
        $new .= ($new !== '' && !str_ends_with($new, "\n") ? "\n" : '') . "# BEGIN SIGAP STATUS OPS16\n"
            . file_get_contents(__DIR__ . '/public/.htaccess') . "\n# END SIGAP STATUS OPS16\n";
        copy($source, $destination . '.next'); chmod($destination . '.next', 0644);
        rename($destination . '.next', $destination);
        file_put_contents($htaccess . '.next', $new, LOCK_EX); chmod($htaccess . '.next', 0644);
        rename($htaccess . '.next', $htaccess);
        echo json_encode(['web'=>'prepared', 'gatewaySha256'=>hash_file('sha256', $destination)]) . "\n";
    } elseif ($operation === 'cron') {
        if ($config['environment'] !== 'production' || ($argv[2] ?? '') !== '--production') throw new RuntimeException('Production flag required');
        [$exit, $old, $error] = command(['crontab', '-l']);
        if ($exit !== 0) throw new RuntimeException('Cannot safely read existing crontab');
        file_put_contents($private . '/crontab-' . $stamp . '.bak', $old, LOCK_EX);
        $new = preg_replace('/^# BEGIN SIGAP STATUS OPS16\n.*?^# END SIGAP STATUS OPS16\n?/ms', '', $old);
        $wrapper = dirname($config['runtime']) . '/cron.php';
        $new .= ($new !== '' && !str_ends_with($new, "\n") ? "\n" : '') . "# BEGIN SIGAP STATUS OPS16\n"
            . '* * * * * ' . escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($wrapper) . ' '
            . escapeshellarg($configPath) . ' cycle >> ' . escapeshellarg($private . '/cycle.log') . " 2>&1\n# END SIGAP STATUS OPS16\n";
        [$exit] = command(['crontab', '-'], $new);
        if ($exit !== 0) throw new RuntimeException('Crontab update failed');
        [$exit, $actual] = command(['crontab', '-l']);
        if ($exit !== 0 || $actual !== $new) throw new RuntimeException('Crontab verification failed');
        echo json_encode(['cron'=>'installed', 'previousSha256'=>hash('sha256',$old), 'currentSha256'=>hash('sha256',$new)]) . "\n";
    } else throw new RuntimeException('Expected web or cron');
    flock($lock, LOCK_UN); fclose($lock);
} catch (Throwable $error) { fwrite(STDERR, $error->getMessage() . "\n"); exit(1); }
