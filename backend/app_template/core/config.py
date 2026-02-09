from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    APP_NAME: str = "App Template"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = False

    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000

    # CORS origins (comma-separated in env)
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
