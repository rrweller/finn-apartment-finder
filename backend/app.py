# backend/app.py
import os, pathlib, sys
from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS

from config import BASE_DIR                # ← absolute import
from api import register_blueprints        # ← absolute import

# --- factory --------------------------------------------------------------
def create_app() -> Flask:
    app = Flask(
        __name__,
        static_folder=str(BASE_DIR / "static"),
        static_url_path="/static",
    )
    CORS(app)
    register_blueprints(app)

    # React-build fallback
    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def react_catch_all(path: str):
        if app.debug:
            return jsonify({"status": "backend up"}), 200
        build_root = pathlib.Path(app.static_folder).parent
        requested  = build_root / path
        if path and requested.exists():
            return send_from_directory(build_root, path)
        return send_from_directory(build_root, "index.html")

    return app

# --------------------------------------------------------------------------
app = create_app()         # ← Gunicorn expects this symbol

if __name__ == "__main__":
    debug = os.environ.get("FLASK_ENV") != "production"
    host  = "127.0.0.1" if debug else "0.0.0.0"
    app.run(debug=debug, host=host, port=5000)
