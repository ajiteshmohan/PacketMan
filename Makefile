.PHONY: install test demo loopback report clean
PY ?= python3

install:
	$(PY) -m pip install -r requirements.txt

test:
	$(PY) -m unittest discover -s tests -t . -v

# Full pipeline on SIMULATED data (no testbed needed)
demo:
	$(PY) simulate.py --outdir demo_data --duration 100
	$(PY) classifier.py train --synthetic --model models/rf.joblib --metrics models/rf_metrics.json
	$(PY) analyze.py --input demo_data --out demo_data/figures --model models/rf.joblib --metrics models/rf_metrics.json

# Real TCP over 127.0.0.1 (checks the measurement path on one machine)
loopback:
	$(PY) server.py --host 127.0.0.1 --port 5201 --outdir outputs & echo $$! > .server.pid; sleep 1; \
	$(PY) client.py --host 127.0.0.1 --scenarios baseline --duration 20 --rate-mbps 20 --cooldown 0; \
	kill `cat .server.pid`; rm -f .server.pid
	$(PY) analyze.py --input outputs

report:
	$(PY) -m pip install -r docs/requirements.txt
	$(PY) docs/make_diagrams.py
	$(PY) docs/build_report.py

clean:
	rm -rf __pycache__ tests/__pycache__ .server.pid
