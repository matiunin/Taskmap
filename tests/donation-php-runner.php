<?php
declare(strict_types=1);
require __DIR__ . '/../server/php/donations.php';
$request = json_decode(stream_get_contents(STDIN), false, 512, JSON_THROW_ON_ERROR);
$config = taskmap_donation_config((array)$request->env);
try {
    $value = match ($request->command) {
        'config' => taskmap_donation_public_config($config),
        'create' => taskmap_donation_create($request->input, $config),
        'callback' => taskmap_donation_accept_result($request->raw, $config),
        'cents' => taskmap_donation_cents($request->amount),
        'signature' => ['checkout' => taskmap_donation_checkout_signature($config, $request->amount, $request->invId, $request->preset),
            'result' => taskmap_donation_result_signature($config, $request->amount, $request->invId, $request->preset)],
        default => throw new RuntimeException('Invalid synthetic test command.'),
    };
    echo json_encode(['status' => 200, 'value' => $value], JSON_THROW_ON_ERROR);
} catch (TaskmapProxyError $error) {
    echo json_encode(['status' => $error->status], JSON_THROW_ON_ERROR);
}
