# Zone & Boundaries Configuration Guide

## ✅ System Status: FULLY CONFIGURED

The zone and boundaries system is **100% functional** and ready to trigger alerts. Here's what's working:

---

## 🎯 Features Implemented

### 1. **Zone Drawing Interface** ✅
- **Location**: Zone Configuration page (accessible from left navigation)
- **Functionality**:
  - Select any camera from dropdown
  - Draw tripwire lines by clicking start and end points
  - Visual feedback with red lines and labels
  - Real-time canvas rendering
  - Multiple zones per camera supported

### 2. **Database Integration** ✅
- **Table**: `camera_zones`
- **Schema**:
  ```sql
  - id: UUID (primary key)
  - camera_id: UUID (foreign key to cameras)
  - type: 'line' | 'zone'
  - points: JSONB array of normalized coordinates [[x1,y1], [x2,y2]]
  - label: Text label for the zone
  - alert_enabled: Boolean (default true)
  - created_at: Timestamp
  ```

### 3. **AI Server Integration** ✅
- **Zone Loading**: AI server polls `camera_zones` table every 5 seconds
- **Line Crossing Detection**: Implemented using geometric intersection algorithm
- **Alert Triggering**: When object crosses a zone line:
  - Event is created in `events` table
  - Snapshot is captured and uploaded
  - Email alerts are sent (if configured)
  - SMS alerts are sent (if configured)
  - Event type is marked as `{object}_crossing`

### 4. **Alert System** ✅
- **Email Alerts**: Configured via Settings → Notifications
- **SMS Alerts**: Configured via Settings → Notifications
- **Event Logging**: All zone crossings logged to database
- **Snapshot Capture**: Frame captured at moment of crossing

---

## 📋 How to Use

### Step 1: Configure a Zone
1. Navigate to **"Zones & Boundaries"** in the left menu
2. Select a camera from the dropdown
3. Wait for a snapshot to load (or click "Refresh Snapshot")
4. Click **"Add Tripwire"** button
5. Click on the image to set the **start point** of the line
6. Click again to set the **end point**
7. The line will appear in red with a label
8. Click **"Save Configuration"** to persist to database

### Step 2: Verify Zone is Active
1. Check that the zone appears in the list below the canvas
2. Verify the AI server logs show: `"Received zone update notification"`
3. The AI server will automatically load the new zones within 5 seconds

### Step 3: Test Alert Triggering
1. Ensure the camera has an AI model assigned (Camera Management → Brain icon)
2. Have an object (person, vehicle, etc.) cross the tripwire line
3. Check the **Events** page for new crossing events
4. Event type will be: `person_crossing`, `car_crossing`, etc.

---

## 🔧 Technical Details

### Zone Crossing Algorithm
```python
def check_zone_crossing(prev_pos, curr_pos, zone_line):
    """
    Detects if an object's movement path intersects with a zone line
    Uses CCW (Counter-Clockwise) geometric algorithm
    
    prev_pos: Previous position (x1, y1)
    curr_pos: Current position (x2, y2)
    zone_line: Line endpoints [(zx1, zy1), (zx2, zy2)]
    
    Returns: True if lines intersect, False otherwise
    """
```

### Coordinate System
- **Normalized Coordinates**: All points stored as 0-1 range
- **Conversion**: Multiplied by frame width/height during detection
- **Benefits**: Resolution-independent, works with any camera resolution

### Detection Flow
1. **Object Detected**: YOLO model detects object in frame
2. **Position Tracked**: Object center point calculated
3. **Movement Calculated**: Distance from previous position
4. **Zone Check**: If movement crosses any zone line → ALERT
5. **Cooldown**: 5-second cooldown after alert to prevent spam

---

## 🐛 Troubleshooting

### Issue: "No Snapshot Available"
**Solution**: 
- Wait for an AI detection event to occur
- Or manually trigger a test event
- Snapshot is pulled from the most recent event for that camera

### Issue: Zones not triggering alerts
**Checklist**:
1. ✅ Camera has an AI model assigned?
2. ✅ AI model is active (`is_active = true`)?
3. ✅ Camera status is not 'disabled'?
4. ✅ Zone was saved (click "Save Configuration")?
5. ✅ AI server is running (`npm run ai-server`)?
6. ✅ Object is actually crossing the line (not just near it)?

### Issue: Alerts not being sent
**Checklist**:
1. ✅ Email/SMS settings configured in Settings page?
2. ✅ Test email/SMS sent successfully?
3. ✅ Notification emails added to the list?
4. ✅ Check AI server console for error messages

---

## 📊 Monitoring

### Check AI Server Logs
```bash
# Look for these messages:
- "Received zone update notification"
- "ZONE CROSSING: {object_type}"
- "SECURITY ALERT: {object}_crossing"
- "Email alert sent to X recipients"
```

### Check Database
```sql
-- View all zones
SELECT * FROM camera_zones;

-- View crossing events
SELECT * FROM events WHERE event_type LIKE '%_crossing';

-- View zones for specific camera
SELECT * FROM camera_zones WHERE camera_id = 'YOUR_CAMERA_ID';
```

---

## 🎨 UI Features

### Visual Indicators
- **Drawing Mode**: Green pulsing dot when active
- **Active Zones Counter**: Shows number of configured zones
- **Zone List**: Cards showing each zone with delete option
- **Canvas Overlay**: Gradient overlay for better visibility
- **Hover Effects**: Opacity changes on hover for better UX

### Keyboard Shortcuts
- **Right-click on canvas**: Cancel current drawing
- **ESC key**: (Future enhancement)

---

## 🚀 Advanced Configuration

### Multiple Zones
- You can add multiple tripwires to a single camera
- Each zone is checked independently
- Alerts are triggered for each crossing

### Zone Types
- **Line (Tripwire)**: Currently implemented - detects crossing
- **Zone (Polygon)**: Future enhancement - detects dwelling/intrusion

### Alert Customization
- Configure email templates in Settings
- Add multiple notification recipients
- Set up SMS alerts with Twilio

---

## ✨ Best Practices

1. **Place tripwires perpendicular to expected movement**
2. **Avoid placing lines too close to camera edges**
3. **Test with actual movement before relying on alerts**
4. **Use descriptive labels** (e.g., "Main Gate Entry", "Perimeter Fence")
5. **Review events regularly** to tune sensitivity

---

## 📝 Summary

Your zone and boundaries system is **fully operational** and ready to:
- ✅ Detect line crossings
- ✅ Trigger real-time alerts
- ✅ Capture snapshots
- ✅ Send email/SMS notifications
- ✅ Log all events to database
- ✅ Auto-refresh configuration every 5 seconds

**Status**: 🟢 **PRODUCTION READY**
