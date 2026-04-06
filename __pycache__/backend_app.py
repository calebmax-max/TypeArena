# Import flask and its components
from flask import *
import os
import json
from flask_cors import CORS
#  CORS = cross origin resource sharing
# import the pymysql module - It helps us to create a connection between python flask and mysql database
import pymysql

# Create a flask application and give it a name
app = Flask(__name__)
CORS(app)

# configure the location where your product images will be savedon your application
app.config["UPLOAD_FOLDER"] = "static/images"
APP_VERSION = "backend_app_event_debug_2026_03_20_v1"


def get_connection():
    return pymysql.connect(
        host="mysql-calebtonny.alwaysdata.net",
        user="calebtonny",
        password="modcom1234",
        database="calebtonny_sokogarden",
    )


def ensure_checkout_tables():
    connection = get_connection()
    cursor = connection.cursor()

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS room_bookings (
            id INT AUTO_INCREMENT PRIMARY KEY,
            room_name VARCHAR(255) NOT NULL,
            description TEXT,
            check_in DATE NOT NULL,
            check_out DATE NOT NULL,
            nights INT NOT NULL,
            amount DECIMAL(10, 2) NOT NULL,
            payment_phone VARCHAR(30) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS food_orders (
            id INT AUTO_INCREMENT PRIMARY KEY,
            order_title VARCHAR(255) NOT NULL,
            preferred_date DATE NOT NULL,
            preferred_time TIME NOT NULL,
            total_amount DECIMAL(10, 2) NOT NULL,
            payment_phone VARCHAR(30) NOT NULL,
            items_json LONGTEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    cursor.execute("SHOW COLUMNS FROM food_orders LIKE 'preferred_time'")
    preferred_time_column = cursor.fetchone()

    if not preferred_time_column:
        cursor.execute(
            """
            ALTER TABLE food_orders
            ADD COLUMN preferred_time TIME NOT NULL
            AFTER preferred_date
            """
        )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS stay_bookings (
            id INT AUTO_INCREMENT PRIMARY KEY,
            customer_name VARCHAR(120),
            phone_number VARCHAR(30),
            room_type VARCHAR(80),
            guests INT,
            meal_plan VARCHAR(80),
            special_request VARCHAR(120),
            check_in DATE NULL,
            check_out DATE NULL,
            nights INT,
            amount DECIMAL(10, 2) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    connection.commit()
    cursor.close()
    connection.close()


def ensure_event_request_table():
    connection = get_connection()
    cursor = connection.cursor()
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS event_requests (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100),
            email VARCHAR(100),
            phone VARCHAR(20),
            event_date DATE,
            event_type VARCHAR(120),
            guests INT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    connection.commit()
    cursor.close()
    connection.close()


@app.route("/api/debug_version", methods=["GET"])
def debug_version():
    return jsonify({"version": APP_VERSION, "module": __name__})


# Below is the sign up route
@app.route("/api/signup", methods = ["POST"])
def signup():
    if request.method == "POST":
        # Extract the different details entered on the form
        username = request.form["username"]
        email = request.form["email"]
        password = request.form["password"]
        phone = request.form["phone"]

        # by use of the print function leyts print all those details send with the upcoming request.
        # print(username, email, password, phone)

        # establish a connection between flask/python and mysql
        connection = get_connection()

        # create a cursor to execute the sql queries
        cursor = connection.cursor()

        # structure an sql to insert the details received from the form
        # %s is a place holder -> A placeholder stands in places of actual i.e we shall replace later
        sql = "INSERT INTO users(username,email,phone,password) VALUES(%s, %s, %s, %s)"

        # create a tuple that will hold all the data gottten from the form.
        data = (username, email, phone, password)

        #by use of the cursor execute the sql as you replace the placeholders with the actual values
        cursor.execute(sql, data)
 
        # commit the changes to the database
        connection.commit()



        return jsonify({"message" : "User registered successfully"})
    


# below is the login/sign in route
@app.route("/api/signin", methods = ["POST"])
def signin():
     if request.method =="POST":
       #extract data from the form
       email = request.form["email"]
       password = request.form["password"]

       print(email,password)
    #    return jsonify({"message" : "Signin route accessed"})
       connection = get_connection()
        # create a cursor to execute the sql queries
       cursor = connection.cursor(pymysql.cursors.DictCursor)
       sql ="SELECT * FROM users WHERE email = %s AND password = %s"
        # create a tuple that will hold all the data gottten from the form.
       data = (email, password)
       #by use of the cursor execute the sql as you replace the placeholders with the actual values
       cursor.execute(sql, data)
       # check whether there are rows returned and store the same on a variable
       count = cursor.rowcount
        # if there are records it means the email and the password are coreect otherwise it means they are wrong

       if count == 0:
           return jsonify({"message" : "Login failed"})
       else:
        # There must be a user so we create a variable that will hold the details of the user fetched from the database
           user = cursor.fetchone()
        #return the deatils to the front-end as welll as a message
           return jsonify({"message" : "User signed up successfully","user":user})
       


       # below is the route for adding products
@app.route("/api/add_product", methods = ["POST"])
def Addproducts():
    if request.method == "POST":
        # extract the data entered on the form
        product_name = request.form["product_name"]
        product_description = request.form["product_description"]
        product_cost = request.form["product_cost"]
        # for the product photo we shall fetch it from the files as shown below
        product_photo = request.files["product_photo"]

        # extract the file name of the product photo
        filename = product_photo.filename

        # by use of the os module (operating system) we can extract the file path where the email is currently saved

        photo_path = os.path.join(app.config["UPLOAD_FOLDER"], filename)

        # save the product photo image into the new location
        product_photo.save(photo_path)



        #print them out to test whether you are receiving the details sent with the request
        #print(product_name, product_description,product_cost,product_photo)

        # establish a connection to the db 
        connection = get_connection()
        # create a cursor
        cursor = connection.cursor()


        #structure the sql query to insert the products details to the details 
        sql = "INSERT INTO product_details(product_name, product_description, product_cost, product_photo) VALUES (%s, %s, %s, %s)"

        # create a tuple that will hold the data from the form which are currently held from the different ariables declared.
        data = (product_name, product_description, product_cost,filename)

        # use the cursor to execute the sql as you replace the placeholders with the actual data 
        cursor.execute(sql, data)

        # commit hte changes to the databases
        connection.commit()
             
        return jsonify({"message": "Product added successfully"}) 
    

    # fetching products
    # define the route
    # create a function
    # create a connection to the DB
    # create a cursor()
    # structure the query ti fetch all data from the table "product_details"
    #   Execute the query
    # create a variable which shall hold/contain all the products from the database
    # REturn the products fetched

    #  Below is the route for fetching products"
@app.route("/api/get_products") 
def get_products():
        # create a connection to the DB
        connection = get_connection()

        # create a cursor
        cursor = connection.cursor(pymysql.cursors.DictCursor )
        #  Structure the query to fetch all the products from the table products_details
        sql = "SELECT * FROM product_details;"
        #  Execute the query
        cursor.execute(sql)

        # create a variable taht will hold the data fetched from the table
        products = cursor.fetchall()


    


        return jsonify(products)



def _extract_event_booking_payload():
    payload = request.get_json(silent=True) or request.form

    return {
        "name": payload.get("name"),
        "email": payload.get("email"),
        "phone": payload.get("phone"),
        "event_date": payload.get("event_date"),
        "event_type": payload.get("event_type"),
        "guests": payload.get("guests"),
    }


def _save_event_booking():
    ensure_event_request_table()
    payload = _extract_event_booking_payload()

    connection = get_connection()
    cursor = connection.cursor()

    try:
        sql = """
            INSERT INTO event_requests(name, email, phone, event_date, event_type, guests)
            VALUES(%s, %s, %s, %s, %s, %s)
        """
        data = (
            payload["name"],
            payload["email"],
            payload["phone"],
            payload["event_date"],
            payload["event_type"],
            payload["guests"],
        )
        cursor.execute(sql, data)
        connection.commit()
    finally:
        cursor.close()
        connection.close()

    return jsonify({"message": "Event request saved successfully"})


@app.route("/api/event_bookings", methods=["POST"])
def eventbookings():
    return _save_event_booking()


@app.route("/api/event-booking", methods=["POST"])
def event_booking():
    return _save_event_booking()


@app.route("/api/get_event_bookings", methods=["GET"])
def get_event_bookings():
    ensure_event_request_table()
    connection = get_connection()
    cursor = connection.cursor(pymysql.cursors.DictCursor)
    cursor.execute("SELECT * FROM event_requests ORDER BY created_at DESC")
    bookings = cursor.fetchall()
    cursor.close()
    connection.close()

    return jsonify(bookings)


@app.route("/api/room_bookings", methods=["POST"])
def room_bookings():
    ensure_checkout_tables()
    payload = request.get_json(force=True)

    room_name = payload.get("room_name")
    description = payload.get("description", "")
    check_in = payload.get("check_in")
    check_out = payload.get("check_out")
    nights = payload.get("nights", 1)
    amount = payload.get("amount", 0)
    payment_phone = payload.get("payment_phone")

    connection = get_connection()
    cursor = connection.cursor()
    sql = """
        INSERT INTO room_bookings
        (room_name, description, check_in, check_out, nights, amount, payment_phone)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
    """
    data = (room_name, description, check_in, check_out, nights, amount, payment_phone)
    cursor.execute(sql, data)
    connection.commit()
    cursor.close()
    connection.close()

    return jsonify({"message": "Room booking saved successfully"})


@app.route("/api/get_room_bookings", methods=["GET"])
def get_room_bookings():
    ensure_checkout_tables()
    connection = get_connection()
    cursor = connection.cursor(pymysql.cursors.DictCursor)
    cursor.execute("SELECT * FROM room_bookings ORDER BY created_at DESC")
    bookings = cursor.fetchall()
    cursor.close()
    connection.close()

    return jsonify(bookings)


@app.route("/api/stay_bookings", methods=["POST"])
def stay_bookings():
    ensure_checkout_tables()
    payload = request.get_json(force=True)

    connection = get_connection()
    cursor = connection.cursor()
    sql = """
        INSERT INTO stay_bookings
        (
            customer_name, phone_number, room_type, guests, meal_plan,
            special_request, check_in, check_out, nights, amount
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """
    data = (
        payload.get("customer_name", ""),
        payload.get("phone_number", ""),
        payload.get("room_type", ""),
        payload.get("guests", 0),
        payload.get("meal_plan", ""),
        payload.get("special_request", ""),
        payload.get("check_in"),
        payload.get("check_out"),
        payload.get("nights", 0),
        payload.get("amount", 0),
    )
    cursor.execute(sql, data)
    connection.commit()
    cursor.close()
    connection.close()

    return jsonify({"message": "Stay booking saved successfully"})


@app.route("/api/get_stay_bookings", methods=["GET"])
def get_stay_bookings():
    ensure_checkout_tables()
    connection = get_connection()
    cursor = connection.cursor(pymysql.cursors.DictCursor)
    cursor.execute("SELECT * FROM stay_bookings ORDER BY created_at DESC")
    bookings = cursor.fetchall()
    cursor.close()
    connection.close()

    return jsonify(bookings)


@app.route("/api/food_orders", methods=["POST"])
def food_orders():
    ensure_checkout_tables()
    payload = request.get_json(force=True)

    order_title = payload.get("order_title")
    preferred_date = payload.get("preferred_date")
    preferred_time = payload.get("preferred_time")
    total_amount = payload.get("total_amount", 0)
    payment_phone = payload.get("payment_phone")
    items = payload.get("items", [])

    connection = get_connection()
    cursor = connection.cursor()
    sql = """
        INSERT INTO food_orders
        (order_title, preferred_date, preferred_time, total_amount, payment_phone, items_json)
        VALUES (%s, %s, %s, %s, %s, %s)
    """
    data = (
        order_title,
        preferred_date,
        preferred_time,
        total_amount,
        payment_phone,
        json.dumps(items),
    )
    cursor.execute(sql, data)
    connection.commit()
    cursor.close()
    connection.close()

    return jsonify({"message": "Food order saved successfully"})


@app.route("/api/get_food_orders", methods=["GET"])
def get_food_orders():
    ensure_checkout_tables()
    connection = get_connection()
    cursor = connection.cursor(pymysql.cursors.DictCursor)
    cursor.execute("SELECT * FROM food_orders ORDER BY created_at DESC")
    orders = cursor.fetchall()
    cursor.close()
    connection.close()

    return jsonify(orders)

       



# Mpesa Payment Route/Endpoint 
import requests
import datetime
import base64
from requests.auth import HTTPBasicAuth
 
@app.route('/api/mpesa_payment', methods=['POST'])
def mpesa_payment():
    if request.method == 'POST':
        amount = request.form['amount']
        phone = request.form['phone']
        # GENERATING THE ACCESS TOKEN
        # create an account on safaricom daraja
        consumer_key = "GTWADFxIpUfDoNikNGqq1C3023evM6UH"
        consumer_secret = "amFbAoUByPV2rM5A"
 
        api_URL = "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials"  # AUTH URL
        r = requests.get(api_URL, auth=HTTPBasicAuth(consumer_key, consumer_secret))
 
        data = r.json()
        access_token = "Bearer" + ' ' + data['access_token']
 
        #  GETTING THE PASSWORD
        timestamp = datetime.datetime.today().strftime('%Y%m%d%H%M%S')
        passkey = 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919'
        business_short_code = "174379"
        data = business_short_code + passkey + timestamp
        encoded = base64.b64encode(data.encode())
        password = encoded.decode('utf-8')
 
        # BODY OR PAYLOAD
        payload = {
            "BusinessShortCode": "174379",
            "Password": "{}".format(password),
            "Timestamp": "{}".format(timestamp),
            "TransactionType": "CustomerPayBillOnline",
            "Amount":amount,  # use 1 when testing
            "PartyA": phone,  # change to your number
            "PartyB": "174379",
            "PhoneNumber": phone,
            "CallBackURL": "https://modcom.co.ke/api/confirmation.php",
            "AccountReference": "account",
            "TransactionDesc": "account"
        }
 
        # POPULAING THE HTTP HEADER
        headers = {
            "Authorization": access_token,
            "Content-Type": "application/json"
        }
 
        url = "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest"  # C2B URL
 
        response = requests.post(url, json=payload, headers=headers)
        print(response.text)
        return jsonify({"message": "Please Complete Payment in Your Phone and we will deliver in minutes"})
     
        


# Run the application  
# app.run(debug=True)

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def catch_all(path):
    if path.startswith('api/'):
        return jsonify({"error": "API route not found"}), 404
    return send_from_directory('../build', 'index.html')
