#!/bin/sh
set -eu
skill_dir=$(CDPATH= cd "$(dirname "$0")" && pwd)
if [ "$#" -eq 0 ]; then set -- start; fi
exec "${RECRUITMENT_PYTHON:-python3}" "$skill_dir/setup/scripts/manage_skill_installation.py" "$@"
