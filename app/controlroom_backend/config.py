from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    db_host: str = "localhost"
    db_port: int = 5432
    db_name: str = "masterdb"
    db_user: str = "studio"
    db_password: str = "studio"

    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 480
    google_client_id: str = ""  # empty = Google login disabled

    app_host: str = "0.0.0.0"  # skipcq: BAN-B104 -- intentional; app binds inside Docker (mirrors .bandit B104 skip)
    app_port: int = 5150

    @property
    def db_dsn(self) -> str:
        return f"postgresql://{self.db_user}:{self.db_password}@{self.db_host}:{self.db_port}/{self.db_name}"


settings = Settings()
