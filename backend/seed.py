import os
import sqlite3
import random
from datetime import datetime, timedelta

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "ecommerce.db")
SCHEMA_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "schema.sql")

# Dummy data pools
NAMES = [
    "Aarav Sharma", "Aditi Rao", "Akash Patel", "Ananya Iyer", "Arjun Verma",
    "Divya Nair", "Ishaan Gupta", "Kabir Singh", "Meera Reddy", "Neha Joshi",
    "Pranav Choudhury", "Pooja Hegde", "Rahul Bose", "Riya Sen", "Rohan Mehta",
    "Sanya Malhotra", "Siddharth Roy", "Sneha Kulkarni", "Vikram Malhotra", "Zara Khan",
    "John Doe", "Jane Smith", "Michael Johnson", "Emily Davis", "David Brown",
    "Sarah Miller", "James Wilson", "Elizabeth Taylor", "William Thomas", "Linda Anderson",
    "Robert Jackson", "Barbara White", "Richard Harris", "Susan Martin", "Joseph Thompson",
    "Jessica Garcia", "Thomas Martinez", "Karen Robinson", "Charles Clark", "Nancy Rodriguez",
    "Christopher Lewis", "Lisa Lee", "Daniel Walker", "Betty Hall", "Matthew Allen",
    "Margaret Young", "Anthony Hernandez", "Sandra King", "Mark Wright", "Ashley Lopez",
    "Steven Hill", "Kimberly Scott", "Andrew Green", "Donna Adams", "Joshua Baker"
]

CITIES = [
    "Mumbai", "Delhi", "Bengaluru", "Hyderabad", "Ahmedabad", "Chennai", "Kolkata", "Pune",
    "New York", "San Francisco", "London", "Tokyo", "Paris", "Berlin", "Sydney", "Toronto"
]

CATEGORIES = {
    "Electronics": ["Smartphone X", "Wireless Headphones", "Mechanical Keyboard", "Smart Watch", "Noise Cancelling Earbuds", "Bluetooth Speaker", "Gaming Mouse", "USB-C Hub", "Laptop Stand", "External SSD"],
    "Clothing": ["Classic Blue Jeans", "Cotton Crewneck T-Shirt", "Leather Jacket", "Running Shoes", "Winter Wool Sweater", "Denim Jacket", "Chino Pants", "Athletic Socks", "Summer Dress", "Hoodie"],
    "Home & Kitchen": ["Stainless Steel Water Bottle", "Ceramic Coffee Mug", "Chef Knife Set", "Air Fryer", "Non-Stick Frying Pan", "Electric Kettle", "Slow Cooker", "Food Storage Containers", "Silicone Spatula Set", "Blender"],
    "Books": ["The Great Gatsby", "To Kill a Mockingbird", "1984", "Pride and Prejudice", "The Hobbit", "Atomic Habits", "Thinking, Fast and Slow", "Sapiens", "Educated", "Deep Work"]
}

def seed_database():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Read and execute schema
    with open(SCHEMA_PATH, "r") as f:
        schema_sql = f.read()
    cursor.executescript(schema_sql)
    
    # Clean existing data if any
    cursor.execute("DELETE FROM orders;")
    cursor.execute("DELETE FROM products;")
    cursor.execute("DELETE FROM users;")
    
    # Reset autoincrement sequences
    cursor.execute("DELETE FROM sqlite_sequence WHERE name IN ('users', 'products', 'orders');")
    
    # 1. Seed Users (60 users)
    users_data = []
    base_date = datetime.now() - timedelta(days=365)
    for i in range(1, 61):
        name = random.choice(NAMES) if i > len(NAMES) else NAMES[i-1]
        # Append some index to ensure uniqueness of email
        email = f"{name.lower().replace(' ', '.')}@{random.choice(['gmail.com', 'yahoo.com', 'outlook.com', 'example.com'])}"
        # Resolve duplicates
        email_prefix, email_domain = email.split('@')
        email = f"{email_prefix}{i}@{email_domain}"
        
        city = random.choice(CITIES)
        created_at = (base_date + timedelta(days=random.randint(0, 360))).strftime("%Y-%m-%d %H:%M:%S")
        users_data.append((name, email, city, created_at))
        
    cursor.executemany(
        "INSERT INTO users (name, email, city, created_at) VALUES (?, ?, ?, ?);",
        users_data
    )
    
    # 2. Seed Products (60 products)
    products_data = []
    all_categories = list(CATEGORIES.keys())
    for i in range(1, 61):
        category = random.choice(all_categories)
        prod_names = CATEGORIES[category]
        base_name = random.choice(prod_names)
        name = f"{base_name} Gen-{random.randint(1, 5)}" if i > len(prod_names) else f"{base_name}"
        price = round(random.uniform(5.0, 1200.0), 2)
        stock = random.randint(0, 150) # 0 means out of stock
        products_data.append((name, category, price, stock))
        
    cursor.executemany(
        "INSERT INTO products (name, category, price, stock) VALUES (?, ?, ?, ?);",
        products_data
    )
    
    # Fetch inserted product details for generating orders
    cursor.execute("SELECT id, price FROM products;")
    products_list = cursor.fetchall()
    
    # 3. Seed Orders (80 orders)
    orders_data = []
    for i in range(1, 81):
        user_id = random.randint(1, 60)
        product_id, price = random.choice(products_list)
        quantity = random.randint(1, 5)
        total_amount = round(price * quantity, 2)
        # Dates within the last 120 days
        order_date = (datetime.now() - timedelta(days=random.randint(0, 120), hours=random.randint(0, 23))).strftime("%Y-%m-%d %H:%M:%S")
        orders_data.append((user_id, product_id, order_date, quantity, total_amount))
        
    cursor.executemany(
        "INSERT INTO orders (user_id, product_id, order_date, quantity, total_amount) VALUES (?, ?, ?, ?, ?);",
        orders_data
    )
    
    conn.commit()
    conn.close()
    print("Database seeded successfully with:")
    print(" - 60 users")
    print(" - 60 products")
    print(" - 80 orders")

if __name__ == "__main__":
    seed_database()
