#!/bin/zsh
set -e
cd "${0:A:h}"
PYTHON="$(pwd)/local_engine/.venv/bin/python"
if [[ ! -x "$PYTHON" ]]; then
  echo "Venv assente. Esegui: python3 -m venv local_engine/.venv"
  read 'REPLY?Premi Invio per chiudere.'
  exit 1
fi
echo "Villanovese Analytics · Viceallenatore AI"
echo "1) Avvia Analytics locale"
echo "2) Importa video, MHTML o PDF"
echo "3) Genera proxy"
echo "4) Genera clip"
echo "5) Esporta bundle JSON"
echo "6) Genera report PDF da esportazione UI"
echo "7) Annota un episodio nel manifest locale"
echo "8) Ricollega un file spostato (verifica SHA-256)"
read 'choice?Scelta: '
case "$choice" in
  1)
    if [[ ! -d node_modules || ! -f .env.local ]]; then
      echo "Servono node_modules e .env.local: consulta README.md"
      exit 1
    fi
    (sleep 3; open 'http://localhost:3000/viceallenatore') &
    npm run dev
    ;;
  2)
    read 'match_id?Match ID canonico: '
    read 'kind?Tipo (video/mhtml/pdf): '
    read 'provider?Fonte (veo/youcoach/staff/other): '
    read 'source_path?Percorso completo del file: '
    "$PYTHON" local_engine/viceallenatore.py import "$match_id" "$kind" "$provider" "$source_path"
    ;;
  3)
    read 'match_id?Match ID canonico: '
    read 'source_id?Source ID del video: '
    "$PYTHON" local_engine/viceallenatore.py proxy "$match_id" "$source_id"
    ;;
  4)
    read 'match_id?Match ID canonico: '
    read 'source_id?Source ID del video: '
    read 'start_ms?Inizio video in millisecondi: '
    read 'end_ms?Fine video in millisecondi: '
    "$PYTHON" local_engine/viceallenatore.py clip "$match_id" "$source_id" "$start_ms" "$end_ms"
    ;;
  5)
    read 'match_id?Match ID canonico: '
    read 'output_path?Percorso output JSON: '
    "$PYTHON" local_engine/viceallenatore.py export "$match_id" "$output_path"
    ;;
  6)
    read 'input_path?Percorso JSON esportato dalla UI: '
    read 'output_path?Percorso PDF output: '
    "$PYTHON" local_engine/viceallenatore.py report "$input_path" "$output_path"
    ;;
  7)
    read 'match_id?Match ID canonico: '
    read 'source_id?Source ID del video: '
    read 'start_ms?Inizio video in millisecondi: '
    read 'end_ms?Fine video in millisecondi: '
    read 'description?Osservazione documentata: '
    "$PYTHON" local_engine/viceallenatore.py annotate "$match_id" "$source_id" "$start_ms" "$end_ms" "$description"
    ;;
  8)
    read 'match_id?Match ID canonico: '
    read 'source_id?Source ID del file: '
    read 'source_path?Nuovo percorso completo: '
    "$PYTHON" local_engine/viceallenatore.py relink "$match_id" "$source_id" "$source_path"
    ;;
  *) echo "Scelta non valida"; exit 1;;
esac
echo "Operazione completata."
read 'REPLY?Premi Invio per chiudere.'
