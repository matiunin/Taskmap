<?php
declare(strict_types=1);
// Local synthetic tests execute the real handler without deploying its /opt wrapper.
require __DIR__ . '/../server/php/proxy.php';
require __DIR__ . '/../server/php/donations.php';
if (in_array(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH), ['/api/donations', '/api/donations.php'], true)) {
    taskmap_handle_donations();
    return;
}
if (in_array(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH), ['/api/donation-result', '/api/donation-result.php'], true)) {
    taskmap_handle_donations(true);
    return;
}
if (parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) === '/api/jira-proxy') {
    taskmap_handle_proxy();
    return;
}
if (parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) === '/api/jira-media') {
    taskmap_handle_proxy(true);
    return;
}
http_response_code(404);
