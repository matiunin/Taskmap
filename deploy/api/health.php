<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET');
    http_response_code(405);
    echo json_encode(['error' => 'Only GET is supported.']);
    exit;
}
require '/opt/taskmap/proxy.php';
try {
    $config = taskmap_config();
    echo json_encode(['status' => 'OK', 'jiraConfigured' => count($config['hosts']) > 0]);
} catch (Throwable) {
    http_response_code(500);
    echo json_encode(['error' => 'Invalid server configuration.']);
}
