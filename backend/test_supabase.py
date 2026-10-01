import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SECRET_KEY")

print("Supabase URL loaded:", bool(url))
print("Supabase key loaded:", bool(key))

if not url or not key:
    raise Exception("Supabase environment variables are missing!")

supabase = create_client(url, key)

result = (
    supabase
    .table("attendance_records")
    .select("*")
    .limit(1)
    .execute()
)

print("✅ Supabase connection successful!")
print("Current data:", result.data)