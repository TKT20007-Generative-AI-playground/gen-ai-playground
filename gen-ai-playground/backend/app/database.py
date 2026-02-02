"""
Database connection and utilities
"""
from pymongo import MongoClient
from pymongo.database import Database
from typing import Optional
from app.config import settings


class DatabaseManager:
    """Manages MongoDB connection"""
    
    def __init__(self):
        self.client: Optional[MongoClient] = None
        self.db: Optional[Database] = None
        self._connect()
    
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
