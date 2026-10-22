from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql+asyncpg://twc:twc@127.0.0.1:5432/twc"
    app_host: str = "127.0.0.1"
    app_port: int = 3000
    cors_origins: str = "http://localhost:4200"
    # Секрет для подписи JWT админки. На проде — длинная случайная строка.
    jwt_secret: str = "change-me"
    jwt_ttl_hours: int = 12

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
