"""
Bundle and register all blueprints with the Flask app.
"""
from flask import Flask
from . import isolines, listings, geocode, commute

def register_blueprints(app: Flask) -> None:
    app.register_blueprint(isolines.bp)
    app.register_blueprint(listings.bp)
    app.register_blueprint(geocode.bp)
    app.register_blueprint(commute.bp)
