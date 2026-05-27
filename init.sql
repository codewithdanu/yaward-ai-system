-- YAWard Database Initialization Script
-- This runs automatically when Docker Compose creates the DB container

-- Create violations table with all necessary columns
CREATE TABLE IF NOT EXISTS violations (
    id SERIAL PRIMARY KEY,
    type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    person_id VARCHAR(100),
    cctv_id VARCHAR(50) NOT NULL,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_at TIMESTAMP,
    acknowledged_by VARCHAR(100),
    message TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_violations_cctv_timestamp ON violations(cctv_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_violations_type ON violations(type);
CREATE INDEX IF NOT EXISTS idx_violations_acknowledged ON violations(acknowledged);
CREATE INDEX IF NOT EXISTS idx_violations_severity ON violations(severity);

-- Seed sample data for testing/demo
INSERT INTO violations (type, severity, person_id, cctv_id, timestamp, message, acknowledged) VALUES
    ('NO_HELMET', 'HIGH', 'person_001', 'CCTV-001', NOW() - INTERVAL '2 hours', 'Worker person_001 detected without helmet', false),
    ('NO_VEST', 'HIGH', 'person_002', 'CCTV-002', NOW() - INTERVAL '1 hour 30 minutes', 'Worker person_002 detected without safety vest', false),
    ('INTRUSION', 'CRITICAL', 'person_003', 'CCTV-003', NOW() - INTERVAL '45 minutes', 'Worker person_003 entered Blasting Area', false),
    ('NO_HELMET', 'HIGH', 'person_004', 'CCTV-001', NOW() - INTERVAL '30 minutes', 'Worker person_004 detected without helmet', true),
    ('NO_VEST', 'HIGH', 'person_005', 'CCTV-004', NOW() - INTERVAL '20 minutes', 'Worker person_005 detected without safety vest', false),
    ('INTRUSION', 'CRITICAL', 'person_006', 'CCTV-002', NOW() - INTERVAL '10 minutes', 'Worker person_006 entered Heavy Machinery Area', false),
    ('NO_HELMET', 'HIGH', 'person_007', 'CCTV-005', NOW() - INTERVAL '5 minutes', 'Worker person_007 detected without helmet', false),
    ('NO_VEST', 'HIGH', 'person_008', 'CCTV-003', NOW() - INTERVAL '2 minutes', 'Worker person_008 detected without safety vest', false);
