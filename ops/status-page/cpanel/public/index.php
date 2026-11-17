<?php
declare(strict_types=1);

ini_set('display_errors', '0');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header('X-Frame-Options: DENY');
header("Content-Security-Policy: default-src 'none'; img-src 'self'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'");

function fail(int $code): never {
    http_response_code($code);
    header('Content-Type: text/plain; charset=utf-8');
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'HEAD') echo 'Status sementara tidak tersedia';
    exit;
}

try {
    $private = dirname(__DIR__, 2) . '/status-private';
    $configPath = $private . '/config.json';
    $config = json_decode((string)file_get_contents($configPath), true, 16, JSON_THROW_ON_ERROR);
    if (strtolower($_SERVER['HTTP_HOST'] ?? '') !== 'status.marisoncloud.com') fail(404);
    $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
    $method = $_SERVER['REQUEST_METHOD'] ?? '';
    if (str_starts_with((string)$path, '/sigap-maintenance/')) {
        if (!isset($config['maintenanceGateway'],$config['maintenanceControlConfig'])) fail(503);
        require $config['maintenanceGateway'];
        exit;
    }
    if ($path === '/report') {
        if ($method !== 'POST') fail(405);
        $stamp = $_SERVER['HTTP_X_SIGAP_TIMESTAMP'] ?? '';
        $signature = $_SERVER['HTTP_X_SIGAP_SIGNATURE'] ?? '';
        if (!preg_match('/^\d{13}$/D', $stamp) || abs(microtime(true) * 1000 - (float)$stamp) > 60000
            || !preg_match('/^[a-f0-9]{128}$/D', $signature)) fail(401);
        if (!str_starts_with($_SERVER['CONTENT_TYPE'] ?? '', 'application/json')) fail(415);
        if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 8192) fail(413);
        $body = file_get_contents('php://input', false, null, 0, 8193);
        if ($body === false || strlen($body) > 8192) fail(413);
        $key = base64_decode($config['collectorPublicKey'] ?? '', true);
        $prefix = hex2bin('302a300506032b6570032100');
        if (!function_exists('sodium_crypto_sign_verify_detached') || $key === false || strlen($key) !== 44
            || substr($key, 0, 12) !== $prefix) fail(503);
        if (!sodium_crypto_sign_verify_detached(hex2bin($signature),
            $stamp . "\nstatus.marisoncloud.com\n/report\n" . $body, substr($key, 12))) fail(401);
        // Authenticate before starting a process: unsigned traffic cannot consume Node workers.
        $lock = fopen($private . '/report.lock', 'c');
        if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) fail(503);
        $process = proc_open([$config['node'], $config['runtime'], 'report', $configPath],
            [['pipe', 'r'], ['pipe', 'w'], ['file', $private . '/report-error.log', 'a']], $pipes);
        if (!is_resource($process)) fail(503);
        fwrite($pipes[0], json_encode(['bodyBase64' => base64_encode($body),
            'timestamp' => $stamp, 'signature' => $signature], JSON_THROW_ON_ERROR));
        fclose($pipes[0]);
        stream_set_blocking($pipes[1], false);
        $output = '';
        $deadline = microtime(true) + 5;
        do {
            $output .= (string)stream_get_contents($pipes[1], 128);
            $state = proc_get_status($process);
            if (!$state['running']) break;
            usleep(10000);
        } while (microtime(true) < $deadline && strlen($output) <= 128);
        if ($state['running']) proc_terminate($process, 9);
        fclose($pipes[1]);
        proc_close($process);
        flock($lock, LOCK_UN);
        fclose($lock);
        $code = trim($output);
        if (!in_array($code, ['204', '400', '401', '413', '415', '503'], true)) fail(503);
        http_response_code((int)$code);
        exit;
    }
    if (!in_array($method, ['GET', 'HEAD'], true)) { header('Allow: GET, HEAD'); fail(405); }
    $routes = [
        '/' => ['index.html', 'text/html; charset=utf-8'],
        '/api/status' => ['status.json', 'application/json; charset=utf-8'],
        '/app.js' => ['app.js', 'text/javascript; charset=utf-8'],
        '/theme.js' => ['theme.js', 'text/javascript; charset=utf-8'],
        '/logo.png' => ['logo.png', 'image/png'],
        '/terms/theme.js' => ['terms-theme.js', 'text/javascript; charset=utf-8'],
        '/terms/logo.png' => ['terms-logo.png', 'image/png'],
        '/terms' => ['terms.html', 'text/html; charset=utf-8'],
        '/terms/' => ['terms.html', 'text/html; charset=utf-8'],
        '/privacy' => ['privacy.html', 'text/html; charset=utf-8'],
        '/privacy/' => ['privacy.html', 'text/html; charset=utf-8'],
        '/rss.xml' => ['feed.rss', 'application/rss+xml; charset=utf-8'],
        '/feed.rss' => ['feed.rss', 'application/rss+xml; charset=utf-8'],
        '/atom.xml' => ['feed.atom', 'application/atom+xml; charset=utf-8'],
        '/feed.atom' => ['feed.atom', 'application/atom+xml; charset=utf-8'],
    ];
    if (!isset($routes[$path])) fail(404);
    $manifest = json_decode((string)file_get_contents($config['snapshots'] . '/current.json'), true, 8, JSON_THROW_ON_ERROR);
    if (($manifest['version'] ?? null) !== 1 || !preg_match('/^snapshot-\d+-[a-f0-9-]{36}$/D', $manifest['directory'] ?? '')) fail(503);
    $directory = $config['snapshots'] . '/' . $manifest['directory'];
    $age = microtime(true) * 1000 - (float)($manifest['generatedAt'] ?? 0);
    if ($age > 180000 || $age < -10000) {
        if ($path === '/' || $path === '/api/status') {
            publicFile($directory, $path === '/' ? 'unavailable.html' : 'unavailable.json', $routes[$path][1], 503);
        }
        if (in_array($path, ['/feed.rss', '/rss.xml', '/feed.atom', '/atom.xml'], true)) fail(503);
    }
    publicFile($directory, $routes[$path][0], $routes[$path][1]);
} catch (Throwable $error) {
    error_log('Status gateway unavailable');
    fail(503);
}

function publicFile(string $directory, string $name, string $type, int $status = 200): never {
    $file = $directory . '/' . $name;
    if (!is_file($file)) fail(503);
    http_response_code($status);
    header('Content-Type: ' . $type);
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'HEAD') readfile($file);
    exit;
}
