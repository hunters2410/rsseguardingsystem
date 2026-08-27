"""
zones.py — Geometry helpers for zone containment and tripwire crossing detection.

Pure functions with no side effects — ideal for unit testing.
"""


def point_in_polygon(point, polygon_points):
    """
    Ray-casting algorithm to check if a point is inside a polygon.
    point: (x, y) in absolute pixels
    polygon_points: list of (x, y) in absolute pixels
    """
    x, y = point
    n = len(polygon_points)
    inside = False
    px, py = polygon_points[0]
    for i in range(1, n + 1):
        qx, qy = polygon_points[i % n]
        if min(py, qy) < y <= max(py, qy):
            if x < (qx - px) * (y - py) / (qy - py + 1e-10) + px:
                inside = not inside
        px, py = qx, qy
    return inside


def check_zone_containment(position, camera_zones, frame_shape):
    """
    Returns True if the position (abs pixels) is inside ANY active polygon zone.
    Ignores 'line' type zones (those use crossing logic instead).
    """
    h, w = frame_shape[:2]
    for zone in camera_zones:
        if not zone.get('alert_enabled', True):
            continue
        if zone.get('type') == 'zone':
            pts = zone.get('points', [])
            if len(pts) < 3:
                continue
            # Scale normalized points to absolute pixels
            abs_pts = [(p[0] * w, p[1] * h) for p in pts]
            if point_in_polygon(position, abs_pts):
                return True
    return False


def has_active_polygon_zones(camera_zones):
    """Returns True if camera has at least one enabled polygon zone."""
    return any(
        z.get('type') == 'zone' and z.get('alert_enabled', True)
        for z in camera_zones
    )


def ccw(A, B, C):
    return (C[1] - A[1]) * (B[0] - A[0]) > (B[1] - A[1]) * (C[0] - A[0])


def intersect(A, B, C, D):
    """Return true if line segments AB and CD intersect"""
    return ccw(A, C, D) != ccw(B, C, D) and ccw(A, B, C) != ccw(A, B, D)


def check_zone_crossing(prev_pos, curr_pos, zone_line):
    """Check if movement from prev_pos to curr_pos crosses a zone_line."""
    A = prev_pos
    B = curr_pos
    C = tuple(zone_line[0])
    D = tuple(zone_line[1])
    return intersect(A, B, C, D)
