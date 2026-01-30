-- Fix bad model paths in database that cause AI server crashes
UPDATE ai_models
SET model_path = 'yolov8n.pt'
WHERE model_path = 'yolov8x_plus.pt' 
   OR model_path = 'pose_ultra.onnx' 
   OR model_path = 'crowd_pro.pt' 
   OR model_path = 'perimeter_guard.pt'
   OR model_path = 'facenet_ultra.onnx'
   OR model_path = 'retinaface_pro.pt'
   OR model_path = 'emotion_v1.pt'
   OR model_path = 'lpr_global_v5.pt'
   OR model_path = 'vehicle_forensic.pt'
   OR model_path = 'traffic_anomaly.pt'
   OR model_path = 'weapon_mil_v4.pt'
   OR model_path = 'shooter_resp.pt'
   OR model_path = 'violence_v1.pt'
   OR model_path = 'fire_pro.pt'
   OR model_path = 'ppe_master.pt'
   OR model_path = 'fall_guard.pt'
   OR model_path = 'abandoned_obj.pt'
   OR model_path = 'shoplift_v1.pt'
   OR model_path = 'drone_shield.pt'
   OR model_path = 'wildlife_v3.pt'
   OR model_path = 'night_vis.pt';

-- Verify the update
SELECT name, model_path FROM ai_models;
