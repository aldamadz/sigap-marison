<?php
declare(strict_types=1);
// Included only by the dedicated status gateway, never installed as a public file.
function maintenanceFail(int $status): never {
    http_response_code($status);header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error'=>$status >= 500 ? 'Kontrol maintenance sementara tidak tersedia.' : 'Permintaan kontrol tidak valid.']);exit;
}
try {
    $control = json_decode((string)file_get_contents($config['maintenanceControlConfig']), true, 16, JSON_THROW_ON_ERROR);
    $hosts = ['sigap.marisoncloud.com','sigap.marison-testing.biz.id'];
    $host = $path === '/sigap-maintenance/state' ? ($_GET['host'] ?? '') : ($_SERVER['HTTP_X_SIGAP_HOSTNAME'] ?? '');
    if (!in_array($host,$hosts,true) || !isset($control['publicKeys'][$host])) maintenanceFail(404);
    if ($path === '/sigap-maintenance/state') {
        if (!in_array($method,['GET','HEAD'],true)) maintenanceFail(405);
        if (!is_file($control['database'])) maintenanceFail(503);
        $db = new SQLite3($control['database'], SQLITE3_OPEN_READONLY);$db->busyTimeout(1000);
        $query=$db->prepare('SELECT state_json FROM control_state WHERE hostname=:host');
        $query->bindValue(':host',$host,SQLITE3_TEXT);$row=$query->execute()->fetchArray(SQLITE3_ASSOC);$db->close();
        if (!$row) maintenanceFail(503);
        $state=json_decode($row['state_json'],true,16,JSON_THROW_ON_ERROR);
        if (!is_int($state['revision'] ?? null) || !array_key_exists('schedule',$state)) maintenanceFail(503);
        $schedule=$state['schedule'];
        if (is_array($schedule)) $schedule=array_intersect_key($schedule,array_flip(['id','category','impact','message','startsAt','endsAt','duration','unit','status']));
        $public=['host'=>$host,'revision'=>$state['revision'],'schedule'=>$schedule];
        if (isset($state['release']) && strtotime($state['release']['completedAt']) <= time() && strtotime($state['release']['expiresAt']) > time()) {
            $public['release']=array_intersect_key($state['release'],array_flip(['id','completedAt','expiresAt','items']));
        }
        http_response_code(200);header('Content-Type: application/json; charset=utf-8');
        if ($method !== 'HEAD') echo json_encode($public,JSON_THROW_ON_ERROR|JSON_UNESCAPED_SLASHES);exit;
    }
    if ($path !== '/sigap-maintenance/control') maintenanceFail(404);
    if ($method !== 'POST') maintenanceFail(405);
    $stamp=$_SERVER['HTTP_X_SIGAP_TIMESTAMP']??'';$signature=$_SERVER['HTTP_X_SIGAP_SIGNATURE']??'';
    if (!preg_match('/^\d{13}$/D',$stamp) || abs(microtime(true)*1000-(float)$stamp)>60000 || !preg_match('/^[a-f0-9]{128}$/D',$signature)) maintenanceFail(401);
    if (!str_starts_with($_SERVER['CONTENT_TYPE']??'','application/json')) maintenanceFail(415);
    if ((int)($_SERVER['CONTENT_LENGTH']??0)>8192) maintenanceFail(413);
    $body=file_get_contents('php://input',false,null,0,8193);if($body===false || strlen($body)>8192)maintenanceFail(413);
    $key=base64_decode($control['publicKeys'][$host],true);$prefix=hex2bin('302a300506032b6570032100');
    if (!function_exists('sodium_crypto_sign_verify_detached') || $key===false || strlen($key)!==44 || substr($key,0,12)!==$prefix)maintenanceFail(503);
    if (!sodium_crypto_sign_verify_detached(hex2bin($signature),$stamp."\n".$host."\n".$body,substr($key,12)))maintenanceFail(401);
    $lock=fopen(dirname($config['maintenanceControlConfig']).'/maintenance-control.lock','c');
    if (!$lock || !flock($lock,LOCK_EX|LOCK_NB))maintenanceFail(503);
    $process=proc_open([$control['node'],$control['runtime'],'request',$config['maintenanceControlConfig']],
        [['pipe','r'],['pipe','w'],['file',dirname($config['maintenanceControlConfig']).'/maintenance-control-error.log','a']],$pipes);
    if(!is_resource($process))maintenanceFail(503);
    fwrite($pipes[0],json_encode(['host'=>$host,'timestamp'=>$stamp,'signature'=>$signature,'bodyBase64'=>base64_encode($body)],JSON_THROW_ON_ERROR));fclose($pipes[0]);
    stream_set_blocking($pipes[1],false);$output='';$deadline=microtime(true)+5;
    do {$output.=(string)stream_get_contents($pipes[1],262145);$state=proc_get_status($process);if(!$state['running'])break;usleep(10000);}while(microtime(true)<$deadline && strlen($output)<=262144);
    if($state['running'])proc_terminate($process,9);fclose($pipes[1]);proc_close($process);flock($lock,LOCK_UN);fclose($lock);
    $result=json_decode($output,true,24,JSON_THROW_ON_ERROR);
    if(!in_array($result['status']??0,[200,400,401,409],true))maintenanceFail(503);
    http_response_code($result['status']);header('Content-Type: application/json; charset=utf-8');
    echo json_encode($result['body']??['error'=>$result['error']],JSON_THROW_ON_ERROR|JSON_UNESCAPED_SLASHES);exit;
} catch(Throwable $error) {error_log('Private maintenance control unavailable');maintenanceFail(503);}
