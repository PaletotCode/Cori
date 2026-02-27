from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from backend.core.config import settings

# Para SQLite: desabilita same_thread check (necessário com FastAPI/async)
connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    echo=settings.DEBUG,  # Loga os SQLs no terminal em modo debug
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    """
    Dependency Injection do SQLAlchemy.
    Garante que cada request receba uma session isolada
    e que ela seja fechada ao final, mesmo em caso de erro.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
