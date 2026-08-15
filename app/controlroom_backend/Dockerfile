FROM python:3.12-slim

RUN apt-get update \
 && apt-get upgrade -y \
 && apt-get install -y --no-install-recommends curl ca-certificates gnupg2 \
 && install -d /usr/share/postgresql-common/pgdg \
 && curl -sSfL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    | gpg --dearmor -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg \
 && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg] \
    https://apt.postgresql.org/pub/repos/apt $(. /etc/os-release && echo "$VERSION_CODENAME")-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client-17 \
 && apt-get purge -y curl gnupg2 \
 && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Lint/security tooling for the containerized roadie unit lane. Kept out of
# requirements.txt on purpose so pip-audit does not audit its own dependency tree.
RUN pip install --no-cache-dir bandit pip-audit

COPY . .

RUN adduser --disabled-password --gecos '' appuser && chown -R appuser /app
USER appuser

EXPOSE 5150

CMD ["python", "main.py"]
