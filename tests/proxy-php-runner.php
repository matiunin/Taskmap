<?php
declare(strict_types=1);
require __DIR__ . '/../server/php/proxy.php';
$fixtures = json_decode(file_get_contents(__DIR__ . '/proxy-policy-fixtures.json'), true, 512, JSON_THROW_ON_ERROR);
$config = taskmap_config(['TASKMAP_JIRA_HOSTS' => $fixtures['hosts']]);
$base = ['url' => 'https://example.atlassian.net/rest/api/3/myself', 'auth' => ['username' => 'person@example.com', 'password' => 'synthetic-api-token']];
$results = [];
foreach ($fixtures['envelopes'] as $fixture) {
    $input = json_decode(json_encode(array_replace($base, $fixture['patch'])), false, 512, JSON_THROW_ON_ERROR);
    $fixtureConfig = array_key_exists('hosts', $fixture) ? taskmap_config(['TASKMAP_JIRA_HOSTS' => $fixture['hosts']]) : $config;
    try { taskmap_validate_envelope($input, $fixtureConfig, $fixture['media'] ?? false); $status = 200; }
    catch (TaskmapProxyError $error) { $status = $error->status; }
    $results['envelopes'][] = ['name' => $fixture['name'], 'status' => $status];
}
foreach ($fixtures['addresses'] as $fixture) $results['addresses'][] = taskmap_public_address($fixture['address']);
try { taskmap_validate_addresses(['8.8.8.8', '127.0.0.1']); $results['mixedDnsStatus'] = 200; }
catch (TaskmapProxyError $error) { $results['mixedDnsStatus'] = $error->status; }
try { taskmap_validate_addresses([]); $results['emptyDnsStatus'] = 200; }
catch (TaskmapProxyError $error) { $results['emptyDnsStatus'] = $error->status; }
$request = taskmap_validate_envelope(json_decode(json_encode($base)), $config);
$options = taskmap_upstream_options($request, '8.8.8.8');
$results['transport'] = ['redirects' => $options[CURLOPT_FOLLOWLOCATION], 'proxy' => $options[CURLOPT_PROXY],
    'pin' => $options[CURLOPT_RESOLVE], 'verifyPeer' => $options[CURLOPT_SSL_VERIFYPEER], 'verifyHost' => $options[CURLOPT_SSL_VERIFYHOST],
    'protocols' => $options[CURLOPT_PROTOCOLS], 'timeout' => $options[CURLOPT_TIMEOUT_MS]];
$results['objectResponse'] = json_decode(taskmap_format_response(404, '{"errorMessages":["Not found"]}'));
$results['arrayResponse'] = json_decode(taskmap_format_response(200, '[]'));
$results['redactedResponse'] = taskmap_format_response(401, json_encode(['authorization' => $request['authorization'], 'token' => 'synthetic-api-token']), $request['secrets']);
$results['nonJsonResponse'] = json_decode(taskmap_format_response(502, '<html>private-upstream-value</html>'));
$results['redirectResponse'] = json_decode(taskmap_format_response(302, '{"private":"no"}'));
$results['noContentResponse'] = taskmap_format_response(204, '');
$mediaRequest = taskmap_validate_envelope(json_decode(json_encode(array_replace($base, ['url' => 'https://example.atlassian.net/rest/api/3/attachment/content/123?redirect=true']))), $config, true);
$png = "\x89PNG\r\n\x1a\n";
$mediaResponse = taskmap_format_media_response(200, $png, 'image/png', $mediaRequest['secrets']);
$results['mediaUrl'] = $mediaRequest['url'];
$results['mediaMime'] = $mediaResponse['contentType'];
$results['mediaBytes'] = base64_encode($mediaResponse['body']);
foreach (['svg' => ['<svg onload="alert(1)"/>', 'image/svg+xml'], 'html' => ['<html>secret</html>', 'image/png'],
    'secret' => [$png . $base['auth']['password'], 'image/png'], 'oversize' => [str_repeat('x', TASKMAP_MAX_RESPONSE_BYTES + 1), 'image/png']] as $name => [$body, $mime]) {
    try { taskmap_format_media_response(200, $body, $mime, $mediaRequest['secrets']); $results['mediaRejections'][$name] = 200; }
    catch (TaskmapProxyError $error) { $results['mediaRejections'][$name] = $error->status; }
}
echo json_encode($results, JSON_THROW_ON_ERROR);
