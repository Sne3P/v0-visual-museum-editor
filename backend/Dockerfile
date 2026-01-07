# ============================================
# BACKEND PYTHON FLASK - Museum Voice
# ============================================
# Multi-stage build OPTIMISÉ avec cache permanent

FROM python:3.11-slim AS base

# Métadonnées
LABEL maintainer="Museum Voice Team"
LABEL description="Backend Flask avec RAG et prégénération IA"

# Variables d'environnement
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=off \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Installer dépendances système (CACHE LAYER - change rarement)
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    libpq-dev \
    curl \
    wget \
    espeak-ng \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ============================================
# STAGE: Dependencies (HEAVY CACHE)
# ============================================
FROM base AS deps

# Copier requirements EN PREMIER pour cache Docker
COPY requirements.txt .

# Installer dépendances lourdes ML séparément (PERMANENT CACHE)
# Torch ~800MB, sentence-transformers ~500MB - Installation 1 fois
# OPTIMISATION: torch CPU-only + compile optimisé
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --upgrade pip setuptools wheel && \
    pip install --no-cache-dir \
    torch>=2.0.0 --index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir \
    sentence-transformers \
    faiss-cpu \
    numpy>=1.23.0

# Installer le reste des dépendances (CACHE si requirements.txt unchanged)
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-cache-dir -r requirements.txt

# ============================================
# STAGE: Development (HOT-RELOAD)
# ============================================
FROM deps AS dev

# Copier code backend (volume monté en dev, donc changements live)
COPY rag/ ./rag/

# Copier scripts de seed et utilitaires
COPY seed_narrations_dynamic.py .
COPY seed_narrations.py .

# Copier script init Piper
COPY init-piper.sh /usr/local/bin/init-piper.sh
RUN chmod +x /usr/local/bin/init-piper.sh

# Télécharger modèles Piper TTS (PERMANENT - ne change pas)
RUN /usr/local/bin/init-piper.sh

# Exposer port Flask
EXPOSE 5000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:5000/health || exit 1

# Command dev avec hot-reload
# Note: Le code sera monté en volume dans docker-compose.dev.yml
CMD ["python", "-m", "flask", "--app", "rag/main_postgres.py", "run", "--host=0.0.0.0", "--port=5000", "--reload", "--debug"]

# ============================================
# STAGE: Production (OPTIMIZED)
# ============================================
FROM deps AS prod

# Copier UNIQUEMENT le code backend (pas les deps - déjà dans deps stage)
COPY rag/ ./rag/

# Copier scripts de seed
COPY seed_narrations_dynamic.py .
COPY seed_narrations.py .

# Copier script init Piper
COPY init-piper.sh /usr/local/bin/init-piper.sh
RUN chmod +x /usr/local/bin/init-piper.sh

# Télécharger modèles Piper TTS
RUN /usr/local/bin/init-piper.sh

# User non-root pour sécurité
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Exposer port
EXPOSE 5000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:5000/health || exit 1

# Command production avec gunicorn
# 4 workers = CPU cores, timeout 120s pour génération RAG
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "4", "--timeout", "120", "--access-logfile", "-", "rag.main_postgres:app"]
