<?php
declare(strict_types=1);
require_once __DIR__ . '/proxy.php';

const TASKMAP_DONATION_BODY_LIMIT = 8192;
const TASKMAP_DONATION_PRESETS = ['small' => 490, 'medium' => 2490, 'large' => 3990];

function taskmap_donation_config(?array $env = null): array {
    $read = static function (string $name, string $default = '') use ($env): string {
        $value = $env === null ? getenv($name) : ($env[$name] ?? false);
        return $value === false || $value === '' ? $default : (string)$value;
    };
    $merchant = $read('TASKMAP_ROBOKASSA_MERCHANT_LOGIN');
    $password1 = $read('TASKMAP_ROBOKASSA_PASSWORD1');
    $password2 = $read('TASKMAP_ROBOKASSA_PASSWORD2');
    $algorithm = strtolower($read('TASKMAP_ROBOKASSA_HASH_ALGORITHM', 'md5'));
    $enabled = $read('TASKMAP_DONATIONS_ENABLED', 'false');
    $testMode = $read('TASKMAP_ROBOKASSA_TEST_MODE', 'true');
    $valid = in_array($enabled, ['true', 'false'], true) && in_array($testMode, ['true', 'false'], true)
        && preg_match('/^[A-Za-z0-9._-]{1,100}$/D', $merchant) === 1
        && in_array($algorithm, ['md5', 'sha256', 'sha512'], true);
    foreach ([$password1, $password2] as $password) {
        $valid = $valid && $password !== '' && strlen($password) <= 512 && preg_match('/[\x00-\x1f\x7f]/', $password) === 0;
    }
    return ['enabled' => $enabled === 'true' && $valid, 'testMode' => $testMode !== 'false',
        'merchantLogin' => $merchant, 'password1' => $password1, 'password2' => $password2, 'algorithm' => $algorithm,
        'dataDir' => $read('TASKMAP_DONATION_DATA_DIR', dirname(__DIR__, 2) . '/data/donations')];
}

function taskmap_donation_public_config(array $config): array {
    $presets = [];
    if ($config['enabled']) foreach (TASKMAP_DONATION_PRESETS as $id => $amount) $presets[] = ['id' => $id, 'amount' => $amount];
    return ['enabled' => $config['enabled'], 'currency' => 'RUB', 'testMode' => $config['testMode'], 'presets' => $presets];
}

function taskmap_donation_validate_input(mixed $input): array {
    if (!$input instanceof stdClass || array_diff(array_keys(get_object_vars($input)), ['preset', 'locale'])
        || !is_string($input->preset ?? null) || !array_key_exists($input->preset, TASKMAP_DONATION_PRESETS)
        || !in_array($input->locale ?? null, ['ru', 'en', 'zh', 'ar', 'es'], true)) {
        throw new TaskmapProxyError(400, 'Invalid donation request.');
    }
    return ['preset' => $input->preset, 'locale' => $input->locale];
}

function taskmap_donation_valid_invoice_id(mixed $value): bool {
    return is_string($value) && preg_match('/^[1-9][0-9]{0,18}$/D', $value) === 1
        && (strlen($value) < 19 || strcmp($value, '9223372036854775807') <= 0);
}

function taskmap_donation_cents(mixed $value): int {
    if (!is_string($value) || preg_match('/^(0|[1-9][0-9]{0,8})(?:\.([0-9]{1,6}))?$/D', $value, $match) !== 1
        || preg_match('/[1-9]/', substr($match[2] ?? '', 2))) {
        throw new TaskmapProxyError(400, 'Invalid payment notification.');
    }
    return (int)$match[1] * 100 + (int)substr(str_pad($match[2] ?? '', 2, '0'), 0, 2);
}

function taskmap_donation_checkout_signature(array $config, string $amount, string $invId, string $preset): string {
    return hash($config['algorithm'], $config['merchantLogin'] . ':' . $amount . ':' . $invId . ':' . $config['password1']
        . ':Shp_kind=donation:Shp_preset=' . $preset);
}

function taskmap_donation_result_signature(array $config, string $amount, string $invId, string $preset): string {
    return hash($config['algorithm'], $amount . ':' . $invId . ':' . $config['password2'] . ':Shp_kind=donation:Shp_preset=' . $preset);
}

function taskmap_donation_prepare_store(array $config): void {
    if (!is_dir($config['dataDir']) && !@mkdir($config['dataDir'], 0700, true) && !is_dir($config['dataDir'])) {
        throw new TaskmapProxyError(503, 'Donation storage is unavailable.');
    }
}

function taskmap_donation_now(): string {
    return (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.v\Z');
}

function taskmap_donation_write($handle, array $invoice): void {
    $data = json_encode($invoice, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
    $written = 0;
    while ($written < strlen($data)) {
        $bytes = fwrite($handle, substr($data, $written));
        if ($bytes === false || $bytes === 0) throw new TaskmapProxyError(503, 'Donation storage is unavailable.');
        $written += $bytes;
    }
    if (!fflush($handle) || !fsync($handle)) throw new TaskmapProxyError(503, 'Donation storage is unavailable.');
}

function taskmap_donation_create(mixed $input, array $config): array {
    $input = taskmap_donation_validate_input($input);
    if (!$config['enabled']) throw new TaskmapProxyError(503, 'Donations are not configured.');
    taskmap_donation_prepare_store($config);
    $amount = TASKMAP_DONATION_PRESETS[$input['preset']] . '.00';
    $invId = null;
    for ($attempt = 0; $attempt < 8; $attempt++) {
        $candidate = (string)random_int(1, PHP_INT_MAX);
        $file = $config['dataDir'] . '/' . $candidate . '.json';
        $handle = @fopen($file, 'x');
        if ($handle === false) {
            if (file_exists($file)) continue;
            throw new TaskmapProxyError(503, 'Donation storage is unavailable.');
        }
        try {
            chmod($file, 0600);
            taskmap_donation_write($handle, ['invId' => $candidate, 'preset' => $input['preset'], 'amount' => $amount,
                'testMode' => $config['testMode'], 'createdAt' => taskmap_donation_now(), 'paidAt' => null]);
            $invId = $candidate;
            break;
        } finally { fclose($handle); }
    }
    if ($invId === null) throw new TaskmapProxyError(503, 'Could not create donation invoice.');
    $parameters = ['MerchantLogin' => $config['merchantLogin'], 'OutSum' => $amount, 'InvId' => $invId,
        'Description' => 'Support Taskmap development', 'Culture' => $input['locale'] === 'ru' ? 'ru' : 'en', 'Encoding' => 'utf-8',
        'SignatureValue' => taskmap_donation_checkout_signature($config, $amount, $invId, $input['preset']),
        'Shp_kind' => 'donation', 'Shp_preset' => $input['preset']];
    if ($config['testMode']) $parameters['IsTest'] = '1';
    return ['url' => 'https://auth.robokassa.ru/Merchant/Index.aspx?' . http_build_query($parameters), 'invId' => $invId];
}

function taskmap_donation_parse_result(string $raw): array {
    if (strlen($raw) > TASKMAP_DONATION_BODY_LIMIT) throw new TaskmapProxyError(413, 'Payment notification is too large.');
    if (preg_match('/%(?![0-9a-f]{2})/i', $raw)) throw new TaskmapProxyError(400, 'Invalid payment notification.');
    $parameters = $raw === '' ? [] : explode('&', $raw);
    if (count($parameters) > 32) throw new TaskmapProxyError(400, 'Invalid payment notification.');
    $result = [];
    foreach ($parameters as $parameter) {
        $pair = explode('=', $parameter, 2);
        $key = urldecode($pair[0]);
        $value = urldecode($pair[1] ?? '');
        if (array_key_exists($key, $result) || preg_match('//u', $key . $value) !== 1 || preg_match('/[\x00-\x1f\x7f]/', $key . $value)
            || (preg_match('/^shp_/i', $key) && !in_array($key, ['Shp_kind', 'Shp_preset'], true))) {
            throw new TaskmapProxyError(400, 'Invalid payment notification.');
        }
        $result[$key] = $value;
    }
    if (!taskmap_donation_valid_invoice_id($result['InvId'] ?? null) || ($result['Shp_kind'] ?? null) !== 'donation'
        || !array_key_exists($result['Shp_preset'] ?? '', TASKMAP_DONATION_PRESETS)
        || preg_match('/^[a-f0-9]{32,128}$/iD', $result['SignatureValue'] ?? '') !== 1) {
        throw new TaskmapProxyError(400, 'Invalid payment notification.');
    }
    taskmap_donation_cents($result['OutSum'] ?? null);
    return $result;
}

function taskmap_donation_accept_result(string $raw, array $config): string {
    if (!$config['enabled']) throw new TaskmapProxyError(503, 'Donations are not configured.');
    $input = taskmap_donation_parse_result($raw);
    $expected = taskmap_donation_result_signature($config, $input['OutSum'], $input['InvId'], $input['Shp_preset']);
    if (!hash_equals($expected, strtolower($input['SignatureValue']))) throw new TaskmapProxyError(403, 'Invalid payment notification.');
    if (array_key_exists('IsTest', $input) && $input['IsTest'] !== ($config['testMode'] ? '1' : '0')) throw new TaskmapProxyError(403, 'Invalid payment notification.');
    taskmap_donation_prepare_store($config);
    $file = $config['dataDir'] . '/' . $input['InvId'] . '.json';
    $lock = $file . '.lock';
    $handle = @fopen($lock, 'x');
    if ($handle === false) throw new TaskmapProxyError(file_exists($lock) ? 409 : 503, 'Donation invoice could not be processed.');
    chmod($lock, 0600);
    $temporary = null;
    try {
        $stored = @file_get_contents($file);
        if ($stored === false) throw new TaskmapProxyError(404, 'Donation invoice was not found.');
        try { $invoice = json_decode($stored, true, 512, JSON_THROW_ON_ERROR); }
        catch (JsonException) { throw new TaskmapProxyError(404, 'Donation invoice was not found.'); }
        if (!is_array($invoice) || count($invoice) !== 6 || array_diff(array_keys($invoice), ['invId', 'preset', 'amount', 'testMode', 'createdAt', 'paidAt'])
            || !is_string($invoice['createdAt'] ?? null) || !preg_match('/^\d{4}-\d{2}-\d{2}T/', $invoice['createdAt'])
            || (!array_key_exists('paidAt', $invoice) || ($invoice['paidAt'] !== null && (!is_string($invoice['paidAt']) || !preg_match('/^\d{4}-\d{2}-\d{2}T/', $invoice['paidAt']))))
            || ($invoice['invId'] ?? null) !== $input['InvId'] || ($invoice['preset'] ?? null) !== $input['Shp_preset']
            || ($invoice['amount'] ?? null) !== (TASKMAP_DONATION_PRESETS[$input['Shp_preset']] . '.00') || ($invoice['testMode'] ?? null) !== $config['testMode']
            || taskmap_donation_cents($input['OutSum']) !== taskmap_donation_cents($invoice['amount'])) {
            throw new TaskmapProxyError(403, 'Invalid payment notification.');
        }
        if ($invoice['paidAt'] === null) {
            $invoice['paidAt'] = taskmap_donation_now();
            $temporary = $config['dataDir'] . '/' . $input['InvId'] . '.' . bin2hex(random_bytes(6)) . '.tmp';
            $updated = @fopen($temporary, 'x');
            if ($updated === false) throw new TaskmapProxyError(503, 'Donation storage is unavailable.');
            try { chmod($temporary, 0600); taskmap_donation_write($updated, $invoice); }
            finally { fclose($updated); }
            if (!@rename($temporary, $file)) throw new TaskmapProxyError(503, 'Donation storage is unavailable.');
            $temporary = null;
        }
        return 'OK' . $input['InvId'];
    } finally {
        if ($temporary !== null) @unlink($temporary);
        fclose($handle);
        @unlink($lock);
    }
}

function taskmap_donation_read_body(string $type): string {
    if (!preg_match('#^' . preg_quote($type, '#') . '(?:\s*;\s*charset=utf-8)?$#iD', $_SERVER['CONTENT_TYPE'] ?? '')) {
        throw new TaskmapProxyError(415, 'Unsupported Content-Type.');
    }
    if (isset($_SERVER['HTTP_CONTENT_ENCODING']) && $_SERVER['HTTP_CONTENT_ENCODING'] !== 'identity') throw new TaskmapProxyError(415, 'Compressed bodies are not supported.');
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > TASKMAP_DONATION_BODY_LIMIT) throw new TaskmapProxyError(413, 'Request body is too large.');
    $raw = file_get_contents('php://input', false, null, 0, TASKMAP_DONATION_BODY_LIMIT + 1);
    if ($raw === false || preg_match('//u', $raw) !== 1) throw new TaskmapProxyError(400, 'Invalid request encoding.');
    if (strlen($raw) > TASKMAP_DONATION_BODY_LIMIT) throw new TaskmapProxyError(413, 'Request body is too large.');
    return $raw;
}

function taskmap_handle_donations(bool $callback = false): void {
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: no-referrer');
    try {
        $config = taskmap_donation_config();
        $method = $_SERVER['REQUEST_METHOD'] ?? '';
        if (!$callback) {
            taskmap_validate_origin(['origin' => $_SERVER['HTTP_ORIGIN'] ?? '', 'host' => $_SERVER['HTTP_HOST'] ?? '',
                'sec-fetch-site' => $_SERVER['HTTP_SEC_FETCH_SITE'] ?? ''], taskmap_config(), !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
            if ($method === 'GET') { echo json_encode(taskmap_donation_public_config($config)); return; }
        }
        if ($method !== 'POST') {
            header('Allow: ' . ($callback ? 'POST' : 'GET, POST'));
            throw new TaskmapProxyError(405, 'Unsupported method.');
        }
        if ($callback) {
            $result = taskmap_donation_accept_result(taskmap_donation_read_body('application/x-www-form-urlencoded'), $config);
            header('Content-Type: text/plain; charset=utf-8');
            echo $result;
        } else {
            try { $input = json_decode(taskmap_donation_read_body('application/json'), false, 512, JSON_THROW_ON_ERROR); }
            catch (JsonException) { throw new TaskmapProxyError(400, 'Invalid JSON.'); }
            echo json_encode(taskmap_donation_create($input, $config), JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
        }
    } catch (TaskmapProxyError $error) {
        http_response_code($error->status);
        echo json_encode(['error' => $error->getMessage()]);
    } catch (Throwable) {
        http_response_code(503);
        echo json_encode(['error' => 'Donation service is unavailable.']);
    }
}
