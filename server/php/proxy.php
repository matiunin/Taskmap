<?php
declare(strict_types=1);

const TASKMAP_MAX_BODY_BYTES = 1048576;
const TASKMAP_MAX_RESPONSE_BYTES = 8388608;

final class TaskmapProxyError extends RuntimeException {
    public function __construct(public readonly int $status, string $message) {
        parent::__construct($message);
    }
}

function taskmap_hostname(string $host): bool {
    return strlen($host) <= 253 && filter_var($host, FILTER_VALIDATE_IP) === false
        && preg_match('/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/D', $host) === 1;
}

function taskmap_config(?array $env = null): array {
    $read = static fn(string $name): string => $env === null ? (getenv($name) ?: '') : (string)($env[$name] ?? '');
    $hosts = array_values(array_filter(array_map(static fn($host) => strtolower(trim($host)), explode(',', $read('TASKMAP_JIRA_HOSTS')))));
    foreach ($hosts as $host) {
        if (!taskmap_hostname($host)) throw new TaskmapProxyError(500, 'Invalid server Jira host configuration.');
    }
    $origin = $read('TASKMAP_PUBLIC_ORIGIN');
    if ($origin !== '' && !preg_match('#^https?://(?:[a-zA-Z0-9.-]+|\[[a-fA-F0-9:]+\])(?::[0-9]{1,5})?$#D', $origin)) {
        throw new TaskmapProxyError(500, 'Invalid server public origin configuration.');
    }
    return ['hosts' => $hosts, 'publicOrigin' => $origin];
}

function taskmap_cidr_contains(string $address, string $cidr): bool {
    [$network, $prefix] = explode('/', $cidr);
    $ip = @inet_pton($address);
    $subnet = @inet_pton($network);
    if ($ip === false || $subnet === false || strlen($ip) !== strlen($subnet)) return false;
    $bits = (int)$prefix;
    $bytes = intdiv($bits, 8);
    if (substr($ip, 0, $bytes) !== substr($subnet, 0, $bytes)) return false;
    $remaining = $bits % 8;
    return $remaining === 0 || ((ord($ip[$bytes]) ^ ord($subnet[$bytes])) & (255 << (8 - $remaining))) === 0;
}

function taskmap_public_address(string $address): bool {
    if (filter_var($address, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) !== false) {
        $blocked = ['0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8',
            '169.254.0.0/16', '172.16.0.0/12', '192.0.0.0/24', '192.0.2.0/24',
            '192.88.99.0/24', '192.168.0.0/16', '198.18.0.0/15', '198.51.100.0/24',
            '203.0.113.0/24', '224.0.0.0/4', '240.0.0.0/4'];
    } else {
        if (!taskmap_cidr_contains($address, '2000::/3')) return false;
        $blocked = ['2001::/23', '2001:db8::/32', '2002::/16', '3fff::/20', '2620:4f:8000::/48'];
    }
    foreach ($blocked as $cidr) {
        if (taskmap_cidr_contains($address, $cidr)) return false;
    }
    return true;
}

function taskmap_validate_origin(array $headers, array $config, bool $encrypted = false): void {
    $site = $headers['sec-fetch-site'] ?? '';
    if ($site !== '' && !in_array($site, ['same-origin', 'none'], true)) {
        throw new TaskmapProxyError(403, 'Cross-origin requests are not allowed.');
    }
    $origin = $headers['origin'] ?? '';
    $expected = $config['publicOrigin'] ?: (($encrypted ? 'https' : 'http') . '://' . ($headers['host'] ?? ''));
    if ($origin !== '' && $origin !== $expected) throw new TaskmapProxyError(403, 'Cross-origin requests are not allowed.');
}

function taskmap_validate_envelope(mixed $input, array $config, bool $media = false): array {
    if (!$input instanceof stdClass) throw new TaskmapProxyError(400, 'Expected a JSON object.');
    $fields = $media ? ['url', 'auth', 'token'] : ['url', 'method', 'auth', 'token', 'data'];
    foreach (array_keys(get_object_vars($input)) as $key) {
        if (!in_array($key, $fields, true)) throw new TaskmapProxyError(400, 'Unsupported request field.');
    }
    $method = property_exists($input, 'method') ? $input->method : 'GET';
    if (!is_string($method) || !in_array($method, ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'], true)) {
        throw new TaskmapProxyError(405, 'Upstream method is not allowed.');
    }
    $url = $input->url ?? null;
    if (!is_string($url) || strlen($url) > 8192 || preg_match('/[\s\\\\\x00-\x1f\x7f]/', $url)) throw new TaskmapProxyError(400, 'Invalid Jira URL.');
    $parts = parse_url($url);
    if ($parts === false) throw new TaskmapProxyError(400, 'Invalid Jira URL.');
    if (count($config['hosts']) === 0) throw new TaskmapProxyError(503, 'Configure TASKMAP_JIRA_HOSTS before using Jira.');
    $host = strtolower($parts['host'] ?? '');
    if (strtolower($parts['scheme'] ?? '') !== 'https' || isset($parts['user']) || isset($parts['pass']) || isset($parts['fragment'])
        || (isset($parts['port']) && $parts['port'] !== 443) || !taskmap_hostname($host) || !in_array($host, $config['hosts'], true)) {
        throw new TaskmapProxyError(403, 'Jira URL is not allowed. Configure TASKMAP_JIRA_HOSTS with your exact Jira host.');
    }
    $rawPath = $parts['path'] ?? '';
    if (preg_match('/%(?![a-fA-F0-9]{2})/', $rawPath)) throw new TaskmapProxyError(400, 'Invalid URL path.');
    $path = rawurldecode($rawPath);
    if ($path === '' || preg_match('/[\\\\%\x00-\x20\x7f]/', $path) || str_contains($path, '//')
        || preg_match('#(?:^|/)\.{1,2}(?:/|$)#', $path) || preg_match('/%2f|%5c/i', $rawPath)) {
        throw new TaskmapProxyError(403, 'Jira path is not allowed.');
    }
    $jiraRest = preg_match('#^/rest/(?:api/[23]|agile/1\.0)/[^?\#]+$#D', $path) === 1;
    $tenantInfo = $path === '/_edge/tenant_info' && $method === 'GET';
    $automation = preg_match('#^/gateway/api/automation/public/jira/[a-zA-Z0-9-]+/rest/v1/rule/manual/(?:search|[a-zA-Z0-9-]+/invocation)$#D', $path) === 1 && $method === 'POST';
    if ($media) {
        if (!preg_match('#^(?:/jira)?/rest/api/[23]/attachment/content/[0-9]{1,20}$#D', $path)) {
            throw new TaskmapProxyError(403, 'Jira attachment path is not allowed.');
        }
        foreach (array_filter(explode('&', $parts['query'] ?? '')) as $parameter) {
            $pair = explode('=', $parameter, 2);
            if (urldecode($pair[0]) !== 'redirect' || !in_array(urldecode($pair[1] ?? ''), ['true', 'false'], true)) {
                throw new TaskmapProxyError(403, 'Jira attachment query is not allowed.');
            }
        }
        $url = 'https://' . $host . $path . '?redirect=false';
    } elseif (!$jiraRest && !$tenantInfo && !$automation) throw new TaskmapProxyError(403, 'Jira path is not allowed.');

    if (property_exists($input, 'token') && property_exists($input, 'auth')) throw new TaskmapProxyError(400, 'Choose one authentication method.');
    if (property_exists($input, 'token')) {
        $token = $input->token;
        if (!is_string($token) || $token === '' || strlen($token) > 8192 || preg_match('/[\x00-\x20\x7f]/', $token)) throw new TaskmapProxyError(400, 'Invalid bearer token.');
        $authorization = 'Bearer ' . $token;
        $secrets = [$token, $authorization];
    } else {
        $auth = $input->auth ?? null;
        if (!$auth instanceof stdClass || array_diff(array_keys(get_object_vars($auth)), ['username', 'password'])
            || !is_string($auth->username ?? null) || $auth->username === '' || strlen($auth->username) > 320 || preg_match('/[:\x00-\x1f\x7f]/', $auth->username)
            || !is_string($auth->password ?? null) || $auth->password === '' || strlen($auth->password) > 4096 || preg_match('/[\x00-\x1f\x7f]/', $auth->password)) {
            throw new TaskmapProxyError(400, 'Jira username and API token are required.');
        }
        $encoded = base64_encode($auth->username . ':' . $auth->password);
        $authorization = 'Basic ' . $encoded;
        $secrets = [$auth->password, $encoded, $authorization];
    }
    $hasData = property_exists($input, 'data') && $input->data !== null;
    if ($hasData && in_array($method, ['GET', 'HEAD'], true)) throw new TaskmapProxyError(400, 'GET and HEAD must not include data.');
    return ['url' => $url, 'host' => $host, 'method' => $method, 'authorization' => $authorization, 'media' => $media,
        'secrets' => $secrets, 'body' => $hasData ? json_encode($input->data, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null];
}

function taskmap_validate_addresses(array $addresses): string {
    if (count($addresses) === 0 || count($addresses) > 64) throw new TaskmapProxyError(502, 'Jira DNS resolution failed.');
    foreach ($addresses as $address) {
        if (!is_string($address) || !taskmap_public_address($address)) throw new TaskmapProxyError(403, 'Jira must resolve only to public IP addresses.');
    }
    return $addresses[0];
}

function taskmap_resolve_host(string $host): string {
    $records = @dns_get_record($host, DNS_A | DNS_AAAA);
    if ($records === false) throw new TaskmapProxyError(502, 'Jira DNS resolution failed.');
    $addresses = [];
    foreach ($records as $record) {
        if (isset($record['ip'])) $addresses[] = $record['ip'];
        if (isset($record['ipv6'])) $addresses[] = $record['ipv6'];
    }
    return taskmap_validate_addresses($addresses);
}

function taskmap_upstream_options(array $request, string $address): array {
    $pinned = str_contains($address, ':') ? '[' . $address . ']' : $address;
    $options = [
        CURLOPT_URL => $request['url'], CURLOPT_CUSTOMREQUEST => $request['method'],
        CURLOPT_FOLLOWLOCATION => false, CURLOPT_MAXREDIRS => 0,
        CURLOPT_CONNECTTIMEOUT_MS => 5000, CURLOPT_TIMEOUT_MS => 25000,
        CURLOPT_SSL_VERIFYPEER => true, CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_PROXY => '', CURLOPT_RESOLVE => [$request['host'] . ':443:' . $pinned],
        CURLOPT_HTTPHEADER => ['Accept: ' . ($request['media'] ? 'image/png,image/jpeg,image/gif,image/webp,image/bmp,image/avif' : 'application/json'),
            'Content-Type: application/json', 'Authorization: ' . $request['authorization']],
    ];
    if ($request['body'] !== null) $options[CURLOPT_POSTFIELDS] = $request['body'];
    if ($request['method'] === 'HEAD') $options[CURLOPT_NOBODY] = true;
    return $options;
}

function taskmap_send_upstream(array $request, string $address): array {
    if (!function_exists('curl_init')) throw new TaskmapProxyError(500, 'PHP cURL extension is required.');
    $curl = curl_init();
    $body = '';
    $tooLarge = false;
    $options = taskmap_upstream_options($request, $address);
    $options[CURLOPT_WRITEFUNCTION] = static function ($handle, string $chunk) use (&$body, &$tooLarge): int {
        if (strlen($body) + strlen($chunk) > TASKMAP_MAX_RESPONSE_BYTES) {
            $tooLarge = true;
            return 0;
        }
        $body .= $chunk;
        return strlen($chunk);
    };
    curl_setopt_array($curl, $options);
    $success = curl_exec($curl);
    $status = (int)curl_getinfo($curl, CURLINFO_HTTP_CODE);
    $contentType = (string)(curl_getinfo($curl, CURLINFO_CONTENT_TYPE) ?: '');
    $error = curl_errno($curl);
    unset($curl);
    if ($tooLarge) throw new TaskmapProxyError(502, 'Jira response is too large.');
    if ($success === false || $error !== 0) throw new TaskmapProxyError($error === CURLE_OPERATION_TIMEDOUT ? 504 : 502, 'Jira request failed.');
    return ['status' => $status, 'body' => $body, 'contentType' => $contentType];
}

function taskmap_format_response(int $status, string $raw, array $secrets = []): string {
    if ($status === 204 || $status === 304) return '';
    if ($status >= 300 && $status < 400) return json_encode(['error' => 'Jira redirects are not followed.', 'fromProxy' => true]);
    try { $payload = json_decode($raw, false, 512, JSON_THROW_ON_ERROR); }
    catch (JsonException) { return json_encode(['error' => 'Jira returned a non-JSON response.', 'fromProxy' => true]); }
    if ($payload instanceof stdClass) $payload->fromProxy = true;
    usort($secrets, static fn($a, $b) => strlen($b) <=> strlen($a));
    $sanitize = static function (mixed $value) use (&$sanitize, $secrets): mixed {
        if (is_string($value)) return str_replace($secrets, '[redacted]', $value);
        if (is_array($value)) return array_map($sanitize, $value);
        if ($value instanceof stdClass) {
            $result = new stdClass();
            foreach (get_object_vars($value) as $key => $item) $result->{str_replace($secrets, '[redacted]', $key)} = $sanitize($item);
            return $result;
        }
        return $value;
    };
    return json_encode($sanitize($payload), JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

function taskmap_format_media_response(int $status, string $bytes, string $contentType, array $secrets = []): array {
    if (strlen($bytes) > TASKMAP_MAX_RESPONSE_BYTES) throw new TaskmapProxyError(502, 'Jira response is too large.');
    if ($status < 200 || $status >= 300) return ['status' => $status, 'contentType' => 'application/json; charset=utf-8',
        'body' => taskmap_format_response($status, $bytes, $secrets)];
    $mime = strtolower(trim(explode(';', $contentType)[0]));
    $matches = match ($mime) {
        'image/png' => substr($bytes, 0, 8) === "\x89PNG\r\n\x1a\n",
        'image/jpeg' => substr($bytes, 0, 3) === "\xff\xd8\xff",
        'image/gif' => in_array(substr($bytes, 0, 6), ['GIF87a', 'GIF89a'], true),
        'image/webp' => substr($bytes, 0, 4) === 'RIFF' && substr($bytes, 8, 4) === 'WEBP',
        'image/bmp' => substr($bytes, 0, 2) === 'BM',
        'image/avif' => substr($bytes, 4, 4) === 'ftyp' && preg_match('/avif|avis/', substr($bytes, 8, 24)) === 1,
        default => false,
    };
    if (!$matches) throw new TaskmapProxyError(502, 'Jira returned an unsupported or invalid image.');
    foreach ($secrets as $secret) {
        if (str_contains($bytes, $secret)) throw new TaskmapProxyError(502, 'Jira returned an invalid image.');
    }
    return ['status' => $status, 'contentType' => $mime, 'body' => $bytes];
}

function taskmap_handle_proxy(bool $media = false): void {
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: ' . ($media ? 'private, no-store' : 'no-store'));
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: no-referrer');
    if ($media) header('Cross-Origin-Resource-Policy: same-origin');
    try {
        $config = taskmap_config();
        $method = $_SERVER['REQUEST_METHOD'] ?? '';
        if ($method === 'GET' && !$media) {
            echo json_encode(['status' => 'OK', 'jiraConfigured' => count($config['hosts']) > 0]);
            return;
        }
        if ($method !== 'POST') {
            header('Allow: ' . ($media ? 'POST' : 'GET, POST'));
            throw new TaskmapProxyError(405, 'Only POST is supported for Jira requests.');
        }
        taskmap_validate_origin(['origin' => $_SERVER['HTTP_ORIGIN'] ?? '', 'host' => $_SERVER['HTTP_HOST'] ?? '',
            'sec-fetch-site' => $_SERVER['HTTP_SEC_FETCH_SITE'] ?? ''], $config, !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
        if (!preg_match('/^application\/json(?:\s*;\s*charset=utf-8)?$/iD', $_SERVER['CONTENT_TYPE'] ?? '')) throw new TaskmapProxyError(415, 'Content-Type must be application/json.');
        if (isset($_SERVER['HTTP_CONTENT_ENCODING']) && $_SERVER['HTTP_CONTENT_ENCODING'] !== 'identity') throw new TaskmapProxyError(415, 'Compressed bodies are not supported.');
        if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > TASKMAP_MAX_BODY_BYTES) throw new TaskmapProxyError(413, 'Request body is too large.');
        $raw = file_get_contents('php://input', false, null, 0, TASKMAP_MAX_BODY_BYTES + 1);
        if ($raw === false) throw new TaskmapProxyError(400, 'Could not read request.');
        if (strlen($raw) > TASKMAP_MAX_BODY_BYTES) throw new TaskmapProxyError(413, 'Request body is too large.');
        try { $input = json_decode($raw, false, 512, JSON_THROW_ON_ERROR); }
        catch (JsonException) { throw new TaskmapProxyError(400, 'Invalid JSON.'); }
        $request = taskmap_validate_envelope($input, $config, $media);
        $result = taskmap_send_upstream($request, taskmap_resolve_host($request['host']));
        if ($media) {
            $safe = taskmap_format_media_response($result['status'], $result['body'], $result['contentType'], $request['secrets']);
            http_response_code($safe['status']);
            header('Content-Type: ' . $safe['contentType']);
            echo $safe['body'];
        } else {
            http_response_code($result['status']);
            echo $request['method'] === 'HEAD' ? '' : taskmap_format_response($result['status'], $result['body'], $request['secrets']);
        }
    } catch (TaskmapProxyError $error) {
        http_response_code($error->status);
        echo json_encode(['error' => $error->getMessage(), 'fromProxy' => true]);
    } catch (Throwable) {
        http_response_code(502);
        echo json_encode(['error' => 'Jira request failed.', 'fromProxy' => true]);
    }
}
