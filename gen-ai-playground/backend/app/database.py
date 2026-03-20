"""
Database connection and utilities
"""
from pymongo import MongoClient
from pymongo.database import Database
from typing import Optional
from app.config import settings
import bcrypt
from datetime import datetime


class DatabaseManager:
    """Manages MongoDB connection"""
    
    def __init__(self):
        self.client: Optional[MongoClient] = None
        self.db: Optional[Database] = None
        self._connect()
        self._seed_admin()
        self._create_indexes()
    
    def _connect(self):
        """Establish MongoDB connection"""
        if not settings.MONGO_DB_URL:
            print("MONGO_DB_URL not set, continuing without database support...")
            return
        
        try:
            self.client = MongoClient(settings.MONGO_DB_URL)
            self.db = self.client["gen_ai_playground"]
            # Test connection
            self.client.admin.command('ping')
            print("Successfully connected to MongoDB!")
        except Exception as e:
            print(f"Failed to connect to MongoDB: {e}")
            print("Continuing without database support...")
            self.client = None
            self.db = None
    
    def _seed_admin(self):
        """Create admin user from env vars if not already present"""
        if self.db is None:
            return
        if not settings.ADMIN_USERNAME or not settings.ADMIN_PASSWORD:
            print("ADMIN_USERNAME/ADMIN_PASSWORD not set, skipping admin seed.")
            return
        
        existing = self.db.users.find_one({"username": settings.ADMIN_USERNAME})
        if existing:
            # Ensure existing user has admin flag
            if not existing.get("is_admin"):
                self.db.users.update_one(
                    {"username": settings.ADMIN_USERNAME},
                    {"$set": {"is_admin": True}}
                )
                print(f"Updated existing user '{settings.ADMIN_USERNAME}' to admin.")
            else:
                print(f"Admin user '{settings.ADMIN_USERNAME}' already exists.")
            return
        
        hashed = bcrypt.hashpw(
            settings.ADMIN_PASSWORD.encode("utf-8"),
            bcrypt.gensalt()
        )
        self.db.users.insert_one({
            "username": settings.ADMIN_USERNAME,
            "password": hashed,
            "is_admin": True,
            "created_at": datetime.utcnow()
        })
        print(f"Admin user '{settings.ADMIN_USERNAME}' created from environment.")
    
    def _create_indexes(self):
        """Create database indexes for optimal query performance"""
        if self.db is None:
            return
        
        # Create index on invitation_codes.created_at for sorting
        self.db.invitation_codes.create_index("created_at", descending=True)
        print("Created index on invitation_codes.created_at")
    
    def get_db(self) -> Optional[Database]:
        """Get database instance"""
        return self.db
    
    def is_available(self) -> bool:
        """Check if database is available"""
        return self.db is not None


# Global database manager instance
db_manager = DatabaseManager()


def get_database() -> Database:
    """Dependency to get database instance"""
    db = db_manager.get_db()
    if db is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=503, detail="Database not available")
    return db
