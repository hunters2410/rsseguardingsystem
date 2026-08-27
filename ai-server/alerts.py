"""
alerts.py — Email and SMS alert dispatch.

Sends notifications via SMTP and Twilio when security events are detected.
"""

import smtplib
from email.mime.text import MIMEText
from datetime import datetime

import requests

from config import supabase, ai_logger


def send_email_alert(settings, event_data):
    """Send an email alert to all configured recipients."""
    if not settings.get('alert_email_enabled'):
        return

    try:
        # Fetch notification list
        recipients = []
        try:
            resp = supabase.table('notification_emails').select('email').execute()
            if resp.data:
                recipients = [r['email'] for r in resp.data]
        except Exception as ex:
            print(f"Error fetching email list: {ex}")

        # Add admin email
        admin = settings.get('admin_email')
        if admin:
            recipients.append(admin)

        # Deduplicate and filter empty
        unique_recipients = list(set([r for r in recipients if r]))

        if not unique_recipients:
            print("No email recipients configured.")
            return

        msg = MIMEText(
            f"Target Detected: {event_data['event_type']} ({event_data['confidence']:.1f}%)\n"
            f"Camera: {event_data['camera_name']}\n"
            f"Time: {datetime.now()}\n\n"
            f"View Snapshot: {event_data['snapshot_url']}"
        )
        msg['Subject'] = f" Security Alert: {event_data['event_type']} Detected"
        msg['From'] = settings.get('smtp_from')
        msg['To'] = ", ".join(unique_recipients)

        with smtplib.SMTP(settings.get('smtp_host'), settings.get('smtp_port')) as server:
            server.starttls()
            server.login(settings.get('smtp_user'), settings.get('smtp_pass'))
            server.send_message(msg)
        print(f"Email alert sent to {len(unique_recipients)} recipients.")
    except Exception as e:
        print(f"Failed to send email: {e}")


def send_sms_alert(settings, event_data):
    """Send an SMS alert via Twilio (if configured)."""
    if not settings.get('alert_sms_enabled'):
        return

    if settings.get('sms_provider') == 'twilio':
        try:
            account_sid = settings.get('sms_account_sid')
            auth_token = settings.get('sms_auth_token')
            url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"

            data = {
                "From": settings.get('sms_from'),
                "To": settings.get('sms_to', settings.get('alert_phone_number', '')),
                "Body": f"ALARM: {event_data['event_type']} detected on {event_data['camera_name']}. Check dashboard."
            }
            resp = requests.post(url, data=data, auth=(account_sid, auth_token))
            if resp.status_code in [200, 201]:
                print("SMS alert sent.")
            else:
                print(f"SMS failed: {resp.text}")
        except Exception as e:
            print(f"Failed to send SMS: {e}")
