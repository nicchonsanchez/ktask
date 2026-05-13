#!/bin/bash
# /opt/ktask/backup.sh — backup diario do KTask.
#
# Executado pelo cron as 03:00 BRT (06:00 UTC). Salva 2 arquivos
# em /opt/ktask/backups/ com timestamp:
#   - postgres-YYYY-MM-DD_HH-MM.sql.gz  (dump do banco, ~50 MB compactado)
#   - minio-YYYY-MM-DD_HH-MM.tar.gz     (anexos dos cards)
#
# Retencao: mantem so os 3 mais recentes de cada (RETAIN=3).
# Apaga os mais antigos automaticamente.
#
# Restore manual:
#   PG:    gunzip -c postgres-*.sql.gz | docker exec -i ktask-postgres psql -U ktask -d ktask
#   MINIO: docker run --rm -v ktask-prod_miniodata:/data -v $(pwd):/backup alpine \
#            sh -c "cd /data && tar xzf /backup/minio-*.tar.gz"
#
# Log: /var/log/ktask-backup.log

set -euo pipefail

BACKUP_DIR="/opt/ktask/backups"
RETAIN=3
TS=$(date '+%Y-%m-%d_%H-%M')
LOG="/var/log/ktask-backup.log"

# Garante diretorio
mkdir -p "$BACKUP_DIR"

# Funcao de log: stdout + arquivo
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"
}

log "============================================================"
log "Iniciando backup KTask"

# ===== POSTGRES =====
PG_FILE="$BACKUP_DIR/postgres-$TS.sql.gz"
log "Postgres → $PG_FILE"

if ! docker exec ktask-postgres pg_dump -U ktask -d ktask | gzip > "$PG_FILE"; then
  log "ERRO no pg_dump"
  rm -f "$PG_FILE"
  exit 1
fi

PG_SIZE=$(du -h "$PG_FILE" | cut -f1)
log "Postgres OK ($PG_SIZE)"

# ===== MINIO =====
# MinIO data fica num volume Docker. Pra fazer backup consistente
# montamos o volume num container alpine que so vive pro tar — assim
# nao precisa parar o MinIO. Pequeno risco de inconsistencia se um
# upload acontecer no exato segundo, mas anexos sao raros e a janela
# de risco eh ~5s.
MINIO_FILE="$BACKUP_DIR/minio-$TS.tar.gz"
log "MinIO → $MINIO_FILE"

if ! docker run --rm \
    -v ktask-prod_miniodata:/data:ro \
    -v "$BACKUP_DIR":/backup \
    alpine \
    sh -c "cd /data && tar czf /backup/minio-$TS.tar.gz ."; then
  log "ERRO no MinIO backup"
  rm -f "$MINIO_FILE"
  exit 1
fi

MINIO_SIZE=$(du -h "$MINIO_FILE" | cut -f1)
log "MinIO OK ($MINIO_SIZE)"

# ===== ROTACAO =====
# Mantem os RETAIN mais recentes de cada tipo. Sort por nome funciona
# porque o timestamp YYYY-MM-DD eh lexicograficamente ordenavel.
log "Rotacao (manter $RETAIN mais recentes de cada)"

rotate() {
  local pattern=$1
  local count=$(ls -1 "$BACKUP_DIR"/$pattern 2>/dev/null | wc -l)
  if [ "$count" -le "$RETAIN" ]; then
    log "  $pattern: $count arquivos (nada a apagar)"
    return
  fi
  local to_delete=$(ls -1 "$BACKUP_DIR"/$pattern | sort | head -n -"$RETAIN")
  for f in $to_delete; do
    log "  apagando: $(basename "$f")"
    rm -f "$f"
  done
}

rotate "postgres-*.sql.gz"
rotate "minio-*.tar.gz"

# ===== RESUMO =====
TOTAL_USED=$(du -sh "$BACKUP_DIR" | cut -f1)
DISK_FREE=$(df -h / | awk 'NR==2 {print $4}')
log "Backup OK | dir: $TOTAL_USED | disco livre: $DISK_FREE"
log "============================================================"
