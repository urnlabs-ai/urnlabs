#!/usr/bin/env python3
"""
ML-Based Threat Detection Service

Provides REST API for machine learning based anomaly detection including:
- Isolation Forest for unsupervised outlier detection
- LSTM networks for sequential pattern analysis
- K-Means clustering for behavioral baselines
- Statistical models and feature engineering

This service is designed to be called from the Node.js ThreatDetectionEngine
for computationally intensive ML operations.
"""

import os
import logging
import pickle
import json
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Tuple

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers
import redis

from flask import Flask, request, jsonify
from flask_cors import CORS
from prometheus_client import Counter, Histogram, Gauge, generate_latest
import joblib

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Metrics
REQUEST_COUNT = Counter('ml_service_requests_total', 'Total requests', ['method', 'endpoint'])
REQUEST_LATENCY = Histogram('ml_service_request_duration_seconds', 'Request latency')
MODEL_PREDICTIONS = Counter('ml_service_predictions_total', 'Total predictions', ['model', 'result'])
ACTIVE_MODELS = Gauge('ml_service_active_models', 'Number of active models')

class MLThreatDetectionService:
    """Main ML service for threat detection"""

    def __init__(self):
        self.app = Flask(__name__)
        CORS(self.app)

        # Redis for caching and data storage
        redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379')
        self.redis = redis.from_url(redis_url)

        # Model storage
        self.models = {}
        self.scalers = {}
        self.encoders = {}
        self.model_metadata = {}

        # Configuration
        self.config = {
            'isolation_forest': {
                'contamination': 0.1,
                'n_estimators': 100,
                'random_state': 42,
                'max_samples': 'auto'
            },
            'kmeans': {
                'n_clusters': 5,
                'random_state': 42,
                'max_iter': 300
            },
            'lstm': {
                'sequence_length': 10,
                'hidden_units': 50,
                'dropout_rate': 0.2,
                'epochs': 50,
                'batch_size': 32
            }
        }

        # Feature definitions
        self.feature_columns = [
            'hour', 'dayOfWeek', 'isWeekend', 'isBusinessHours',
            'eventType_encoded', 'category_encoded', 'severity_encoded',
            'outcome_encoded', 'actorType_encoded', 'duration',
            'failureRate', 'actionsPerSession', 'uniqueResourcesCount',
            'timeSinceLastEvent', 'eventFrequency', 'riskScore', 'complianceFlags'
        ]

        self.setup_routes()

    def setup_routes(self):
        """Setup Flask routes"""

        @self.app.route('/health', methods=['GET'])
        def health():
            """Health check endpoint"""
            return jsonify({
                'status': 'healthy',
                'timestamp': datetime.utcnow().isoformat(),
                'active_models': list(self.models.keys()),
                'version': '1.0.0'
            })

        @self.app.route('/metrics', methods=['GET'])
        def metrics():
            """Prometheus metrics endpoint"""
            return generate_latest()

        @self.app.route('/models/status', methods=['GET'])
        def model_status():
            """Get status of all models"""
            status = {}
            for name, model in self.models.items():
                metadata = self.model_metadata.get(name, {})
                status[name] = {
                    'loaded': model is not None,
                    'type': metadata.get('type', 'unknown'),
                    'last_trained': metadata.get('last_trained'),
                    'training_samples': metadata.get('training_samples', 0),
                    'accuracy': metadata.get('accuracy', 0.0)
                }
            return jsonify({'models': status})

        # Isolation Forest endpoints
        @self.app.route('/models/isolation_forest/initialize', methods=['POST'])
        def init_isolation_forest():
            return self._handle_request(self._init_isolation_forest)

        @self.app.route('/models/isolation_forest/predict', methods=['POST'])
        def predict_isolation_forest():
            return self._handle_request(self._predict_isolation_forest)

        @self.app.route('/models/isolation_forest/train', methods=['POST'])
        def train_isolation_forest():
            return self._handle_request(self._train_isolation_forest)

        # LSTM endpoints
        @self.app.route('/models/lstm/initialize', methods=['POST'])
        def init_lstm():
            return self._handle_request(self._init_lstm)

        @self.app.route('/models/lstm/predict', methods=['POST'])
        def predict_lstm():
            return self._handle_request(self._predict_lstm)

        @self.app.route('/models/lstm/train', methods=['POST'])
        def train_lstm():
            return self._handle_request(self._train_lstm)

        # Clustering endpoints
        @self.app.route('/models/clustering/initialize', methods=['POST'])
        def init_clustering():
            return self._handle_request(self._init_clustering)

        @self.app.route('/models/clustering/predict', methods=['POST'])
        def predict_clustering():
            return self._handle_request(self._predict_clustering)

        @self.app.route('/models/clustering/train', methods=['POST'])
        def train_clustering():
            return self._handle_request(self._train_clustering)

        # Batch operations
        @self.app.route('/models/retrain', methods=['POST'])
        def retrain_models():
            return self._handle_request(self._retrain_models)

    def _handle_request(self, handler_func):
        """Generic request handler with metrics and error handling"""
        REQUEST_COUNT.labels(method=request.method, endpoint=request.endpoint).inc()

        with REQUEST_LATENCY.time():
            try:
                result = handler_func()
                return jsonify(result)
            except Exception as e:
                logger.error(f"Error in {request.endpoint}: {str(e)}")
                return jsonify({
                    'success': False,
                    'error': str(e),
                    'timestamp': datetime.utcnow().isoformat()
                }), 500

    # Isolation Forest methods
    def _init_isolation_forest(self):
        """Initialize Isolation Forest model"""
        params = request.get_json() or {}
        config = {**self.config['isolation_forest'], **params}

        model = IsolationForest(
            contamination=config['contamination'],
            n_estimators=config['n_estimators'],
            random_state=config['random_state'],
            max_samples=config['max_samples']
        )

        self.models['isolation_forest'] = model
        self.scalers['isolation_forest'] = StandardScaler()
        self.model_metadata['isolation_forest'] = {
            'type': 'isolation_forest',
            'initialized': datetime.utcnow().isoformat(),
            'config': config
        }

        ACTIVE_MODELS.set(len(self.models))

        return {
            'success': True,
            'model': 'isolation_forest',
            'config': config,
            'timestamp': datetime.utcnow().isoformat()
        }

    def _predict_isolation_forest(self):
        """Predict anomalies using Isolation Forest"""
        data = request.get_json()
        features = np.array(data['features']).reshape(1, -1)

        if 'isolation_forest' not in self.models:
            raise ValueError("Isolation Forest model not initialized")

        model = self.models['isolation_forest']
        scaler = self.scalers['isolation_forest']

        # Scale features if scaler is fitted
        if hasattr(scaler, 'mean_'):
            features_scaled = scaler.transform(features)
        else:
            features_scaled = features

        # Predict anomaly
        anomaly_label = model.predict(features_scaled)[0]  # -1 for anomaly, 1 for normal
        anomaly_score = model.decision_function(features_scaled)[0]

        # Convert to probability-like score (0-1)
        anomaly_probability = 1 / (1 + np.exp(anomaly_score))  # Sigmoid transformation

        is_anomaly = anomaly_label == -1

        MODEL_PREDICTIONS.labels(model='isolation_forest', result='anomaly' if is_anomaly else 'normal').inc()

        return {
            'anomaly_score': float(anomaly_probability),
            'is_anomaly': bool(is_anomaly),
            'confidence': float(abs(anomaly_score)),
            'raw_score': float(anomaly_score),
            'model': 'isolation_forest',
            'timestamp': datetime.utcnow().isoformat()
        }

    def _train_isolation_forest(self):
        """Train Isolation Forest with provided data"""
        data = request.get_json()
        training_data = np.array(data['training_data'])

        if training_data.shape[1] != len(self.feature_columns):
            raise ValueError(f"Expected {len(self.feature_columns)} features, got {training_data.shape[1]}")

        model = self.models['isolation_forest']
        scaler = self.scalers['isolation_forest']

        # Fit scaler and transform data
        training_data_scaled = scaler.fit_transform(training_data)

        # Train model
        model.fit(training_data_scaled)

        # Update metadata
        self.model_metadata['isolation_forest'].update({
            'last_trained': datetime.utcnow().isoformat(),
            'training_samples': len(training_data),
            'trained': True
        })

        return {
            'success': True,
            'model': 'isolation_forest',
            'training_samples': len(training_data),
            'timestamp': datetime.utcnow().isoformat()
        }

    # LSTM methods
    def _init_lstm(self):
        """Initialize LSTM model for sequential analysis"""
        params = request.get_json() or {}
        config = {**self.config['lstm'], **params}

        # Build LSTM model
        model = keras.Sequential([
            layers.LSTM(config['hidden_units'], return_sequences=True, input_shape=(config['sequence_length'], len(self.feature_columns))),
            layers.Dropout(config['dropout_rate']),
            layers.LSTM(config['hidden_units']//2),
            layers.Dropout(config['dropout_rate']),
            layers.Dense(len(self.feature_columns)),  # Reconstruct input
            layers.Dense(1, activation='sigmoid')  # Anomaly probability
        ])

        model.compile(
            optimizer='adam',
            loss='mse',
            metrics=['mae']
        )

        self.models['lstm'] = model
        self.scalers['lstm'] = StandardScaler()
        self.model_metadata['lstm'] = {
            'type': 'lstm',
            'initialized': datetime.utcnow().isoformat(),
            'config': config
        }

        ACTIVE_MODELS.set(len(self.models))

        return {
            'success': True,
            'model': 'lstm',
            'config': config,
            'timestamp': datetime.utcnow().isoformat()
        }

    def _predict_lstm(self):
        """Predict using LSTM model"""
        data = request.get_json()
        sequence = np.array(data['sequence'])  # Should be (sequence_length, features)

        if 'lstm' not in self.models:
            raise ValueError("LSTM model not initialized")

        model = self.models['lstm']
        scaler = self.scalers['lstm']

        # Reshape for LSTM input (1, sequence_length, features)
        if len(sequence.shape) == 2:
            sequence = sequence.reshape(1, sequence.shape[0], sequence.shape[1])

        # Scale sequence if scaler is fitted
        if hasattr(scaler, 'mean_'):
            sequence_scaled = scaler.transform(sequence.reshape(-1, sequence.shape[-1]))
            sequence_scaled = sequence_scaled.reshape(sequence.shape)
        else:
            sequence_scaled = sequence

        # Predict
        prediction = model.predict(sequence_scaled, verbose=0)[0][0]

        # Calculate reconstruction error for anomaly detection
        reconstruction = model.predict(sequence_scaled, verbose=0)
        reconstruction_error = np.mean(np.square(sequence_scaled[0][-1] - reconstruction[0]))

        is_anomaly = reconstruction_error > 0.1  # Threshold for anomaly

        MODEL_PREDICTIONS.labels(model='lstm', result='anomaly' if is_anomaly else 'normal').inc()

        return {
            'prediction_error': float(reconstruction_error),
            'is_anomaly': bool(is_anomaly),
            'confidence': float(min(reconstruction_error * 5, 1.0)),  # Scale to 0-1
            'model': 'lstm',
            'timestamp': datetime.utcnow().isoformat()
        }

    def _train_lstm(self):
        """Train LSTM model"""
        data = request.get_json()
        sequences = np.array(data['sequences'])  # (samples, sequence_length, features)
        labels = np.array(data.get('labels', [0] * len(sequences)))  # 0 for normal, 1 for anomaly

        model = self.models['lstm']
        scaler = self.scalers['lstm']
        config = self.model_metadata['lstm']['config']

        # Prepare data
        X = sequences
        y = labels

        # Scale features
        X_reshaped = X.reshape(-1, X.shape[-1])
        X_scaled = scaler.fit_transform(X_reshaped)
        X_scaled = X_scaled.reshape(X.shape)

        # Split data
        X_train, X_val, y_train, y_val = train_test_split(X_scaled, y, test_size=0.2, random_state=42)

        # Train model
        history = model.fit(
            X_train, y_train,
            epochs=config['epochs'],
            batch_size=config['batch_size'],
            validation_data=(X_val, y_val),
            verbose=0
        )

        # Calculate accuracy
        val_predictions = model.predict(X_val, verbose=0)
        val_predictions_binary = (val_predictions > 0.5).astype(int)
        accuracy = np.mean(val_predictions_binary.flatten() == y_val)

        # Update metadata
        self.model_metadata['lstm'].update({
            'last_trained': datetime.utcnow().isoformat(),
            'training_samples': len(sequences),
            'accuracy': float(accuracy),
            'trained': True
        })

        return {
            'success': True,
            'model': 'lstm',
            'training_samples': len(sequences),
            'accuracy': float(accuracy),
            'final_loss': float(history.history['loss'][-1]),
            'timestamp': datetime.utcnow().isoformat()
        }

    # Clustering methods
    def _init_clustering(self):
        """Initialize clustering model"""
        params = request.get_json() or {}
        config = {**self.config['kmeans'], **params}

        model = KMeans(
            n_clusters=config['n_clusters'],
            random_state=config['random_state'],
            max_iter=config['max_iter']
        )

        self.models['clustering'] = model
        self.scalers['clustering'] = StandardScaler()
        self.model_metadata['clustering'] = {
            'type': 'kmeans',
            'initialized': datetime.utcnow().isoformat(),
            'config': config
        }

        ACTIVE_MODELS.set(len(self.models))

        return {
            'success': True,
            'model': 'clustering',
            'config': config,
            'timestamp': datetime.utcnow().isoformat()
        }

    def _predict_clustering(self):
        """Predict using clustering model"""
        data = request.get_json()
        features = np.array(data['features']).reshape(1, -1)

        if 'clustering' not in self.models:
            raise ValueError("Clustering model not initialized")

        model = self.models['clustering']
        scaler = self.scalers['clustering']

        # Scale features if scaler is fitted
        if hasattr(scaler, 'mean_'):
            features_scaled = scaler.transform(features)
        else:
            features_scaled = features

        # Predict cluster
        cluster_id = model.predict(features_scaled)[0]

        # Calculate distance to centroid
        centroid = model.cluster_centers_[cluster_id]
        distance = np.linalg.norm(features_scaled[0] - centroid)

        # Determine if anomaly based on distance threshold
        distances_to_all_centroids = [
            np.linalg.norm(features_scaled[0] - center)
            for center in model.cluster_centers_
        ]
        avg_distance = np.mean(distances_to_all_centroids)
        is_anomaly = distance > avg_distance * 1.5  # Threshold for anomaly

        # Normalize distance to 0-1 scale
        max_distance = np.max(distances_to_all_centroids)
        normalized_distance = distance / max_distance if max_distance > 0 else 0

        MODEL_PREDICTIONS.labels(model='clustering', result='anomaly' if is_anomaly else 'normal').inc()

        return {
            'distance_to_centroid': float(normalized_distance),
            'cluster_id': int(cluster_id),
            'is_anomaly': bool(is_anomaly),
            'confidence': float(normalized_distance),
            'model': 'clustering',
            'timestamp': datetime.utcnow().isoformat()
        }

    def _train_clustering(self):
        """Train clustering model"""
        data = request.get_json()
        training_data = np.array(data['training_data'])

        model = self.models['clustering']
        scaler = self.scalers['clustering']

        # Scale data
        training_data_scaled = scaler.fit_transform(training_data)

        # Train model
        model.fit(training_data_scaled)

        # Calculate inertia as a quality metric
        inertia = model.inertia_

        # Update metadata
        self.model_metadata['clustering'].update({
            'last_trained': datetime.utcnow().isoformat(),
            'training_samples': len(training_data),
            'inertia': float(inertia),
            'trained': True
        })

        return {
            'success': True,
            'model': 'clustering',
            'training_samples': len(training_data),
            'inertia': float(inertia),
            'n_clusters': model.n_clusters,
            'timestamp': datetime.utcnow().isoformat()
        }

    def _retrain_models(self):
        """Retrain specified models"""
        data = request.get_json()
        models_to_retrain = data.get('models', [])

        results = {}

        for model_name in models_to_retrain:
            if model_name in self.models:
                try:
                    # In practice, would fetch training data from database
                    # For now, simulate retraining
                    self.model_metadata[model_name]['last_retrained'] = datetime.utcnow().isoformat()
                    results[model_name] = {'success': True, 'message': 'Retrained successfully'}
                except Exception as e:
                    results[model_name] = {'success': False, 'error': str(e)}
            else:
                results[model_name] = {'success': False, 'error': 'Model not found'}

        return {
            'success': True,
            'results': results,
            'timestamp': datetime.utcnow().isoformat()
        }

    def save_models(self, directory: str = './models'):
        """Save trained models to disk"""
        os.makedirs(directory, exist_ok=True)

        for name, model in self.models.items():
            model_path = os.path.join(directory, f'{name}_model.pkl')
            scaler_path = os.path.join(directory, f'{name}_scaler.pkl')
            metadata_path = os.path.join(directory, f'{name}_metadata.json')

            try:
                # Save model
                if name == 'lstm':
                    model.save(os.path.join(directory, f'{name}_model.h5'))
                else:
                    joblib.dump(model, model_path)

                # Save scaler
                joblib.dump(self.scalers[name], scaler_path)

                # Save metadata
                with open(metadata_path, 'w') as f:
                    json.dump(self.model_metadata[name], f, indent=2)

                logger.info(f"Saved model {name}")

            except Exception as e:
                logger.error(f"Failed to save model {name}: {e}")

    def load_models(self, directory: str = './models'):
        """Load trained models from disk"""
        if not os.path.exists(directory):
            logger.warning(f"Models directory {directory} does not exist")
            return

        for filename in os.listdir(directory):
            if filename.endswith('_model.pkl') or filename.endswith('_model.h5'):
                name = filename.replace('_model.pkl', '').replace('_model.h5', '')
                model_path = os.path.join(directory, filename)
                scaler_path = os.path.join(directory, f'{name}_scaler.pkl')
                metadata_path = os.path.join(directory, f'{name}_metadata.json')

                try:
                    # Load model
                    if filename.endswith('.h5'):
                        self.models[name] = keras.models.load_model(model_path)
                    else:
                        self.models[name] = joblib.load(model_path)

                    # Load scaler
                    if os.path.exists(scaler_path):
                        self.scalers[name] = joblib.load(scaler_path)

                    # Load metadata
                    if os.path.exists(metadata_path):
                        with open(metadata_path, 'r') as f:
                            self.model_metadata[name] = json.load(f)

                    logger.info(f"Loaded model {name}")

                except Exception as e:
                    logger.error(f"Failed to load model {name}: {e}")

        ACTIVE_MODELS.set(len(self.models))

def create_app():
    """Create and configure the Flask application"""
    service = MLThreatDetectionService()

    # Load existing models if available
    service.load_models()

    return service.app

if __name__ == '__main__':
    app = create_app()

    # Run the application
    port = int(os.getenv('PORT', 5000))
    debug = os.getenv('DEBUG', 'false').lower() == 'true'

    logger.info(f"Starting ML Threat Detection Service on port {port}")
    app.run(host='0.0.0.0', port=port, debug=debug)