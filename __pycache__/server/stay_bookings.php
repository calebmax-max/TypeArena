<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['message' => 'Method not allowed']);
    exit;
}

$payload = json_decode(file_get_contents('php://input'), true);

if (!$payload) {
    http_response_code(400);
    echo json_encode(['message' => 'Invalid JSON payload']);
    exit;
}

$connection = new mysqli(
    'mysql-calebtonny.alwaysdata.net',
    'calebtonny',
    'modcom1234',
    'calebtonny_sokogarden'
);

if ($connection->connect_error) {
    http_response_code(500);
    echo json_encode(['message' => 'Database connection failed']);
    exit;
}

$createTableSql = "
    CREATE TABLE IF NOT EXISTS stay_bookings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        booking_title VARCHAR(255) NOT NULL,
        booking_type VARCHAR(50) NOT NULL,
        description TEXT,
        customer_name VARCHAR(120),
        phone_number VARCHAR(30),
        room_type VARCHAR(80),
        guests INT,
        meal_plan VARCHAR(80),
        special_request VARCHAR(120),
        check_in DATE NULL,
        check_out DATE NULL,
        nights INT,
        package_title VARCHAR(255),
        package_description TEXT,
        amount DECIMAL(10, 2) NOT NULL,
        payment_phone VARCHAR(30) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
";

if (!$connection->query($createTableSql)) {
    http_response_code(500);
    echo json_encode(['message' => 'Failed to prepare stay_bookings table']);
    $connection->close();
    exit;
}

$statement = $connection->prepare("
    INSERT INTO stay_bookings (
        booking_title, booking_type, description, customer_name, phone_number,
        room_type, guests, meal_plan, special_request, check_in, check_out, nights,
        package_title, package_description, amount, payment_phone
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
");

if (!$statement) {
    http_response_code(500);
    echo json_encode(['message' => 'Failed to prepare insert statement']);
    $connection->close();
    exit;
}

$bookingTitle = $payload['booking_title'] ?? '';
$bookingType = $payload['booking_type'] ?? '';
$description = $payload['description'] ?? '';
$customerName = $payload['customer_name'] ?? '';
$phoneNumber = $payload['phone_number'] ?? '';
$roomType = $payload['room_type'] ?? '';
$guests = (int) ($payload['guests'] ?? 0);
$mealPlan = $payload['meal_plan'] ?? '';
$specialRequest = $payload['special_request'] ?? '';
$checkIn = !empty($payload['check_in']) ? $payload['check_in'] : null;
$checkOut = !empty($payload['check_out']) ? $payload['check_out'] : null;
$nights = (int) ($payload['nights'] ?? 0);
$packageTitle = $payload['package_title'] ?? '';
$packageDescription = $payload['package_description'] ?? '';
$amount = (float) ($payload['amount'] ?? 0);
$paymentPhone = $payload['payment_phone'] ?? '';

$statement->bind_param(
    'ssssssissssissds',
    $bookingTitle,
    $bookingType,
    $description,
    $customerName,
    $phoneNumber,
    $roomType,
    $guests,
    $mealPlan,
    $specialRequest,
    $checkIn,
    $checkOut,
    $nights,
    $packageTitle,
    $packageDescription,
    $amount,
    $paymentPhone
);

if (!$statement->execute()) {
    http_response_code(500);
    echo json_encode(['message' => 'Failed to save stay booking']);
    $statement->close();
    $connection->close();
    exit;
}

echo json_encode(['message' => 'Stay booking saved successfully']);

$statement->close();
$connection->close();
