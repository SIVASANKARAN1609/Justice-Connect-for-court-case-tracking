import { Resend } from 'resend';
import twilio from 'twilio';
import { db } from '@workspace/db';
import { notificationsTable } from '@workspace/db/schema';

const resend = process.env.EMAIL_API_KEY ? new Resend(process.env.EMAIL_API_KEY) : null;
const twilioClient = process.env.SMS_API_KEY ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.SMS_API_KEY) : null;

export async function sendNotification(
  userId: number,
  title: string,
  type: string,
  message: string,
  userEmail?: string,
  userPhone?: string
) {
  // 1. In-App Notification (Always log)
  let status = "PENDING";

  try {
    // 2. Email (if configured)
    if (resend && userEmail && process.env.NOTIFICATION_EMAIL_ENABLED === "true") {
      await resend.emails.send({
        from: 'Justice Connect <notifications@justiceconnect.app>',
        to: userEmail,
        subject: `Update on your case: ${type}`,
        text: message,
      });
      status = "SENT";
    }

    // 3. SMS (if configured)
    if (twilioClient && userPhone && process.env.NOTIFICATION_SMS_ENABLED === "true") {
      await twilioClient.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: userPhone
      });
      status = "SENT";
    }

    if (!resend && !twilioClient) {
      console.log(`[Notification Sim] -> To User ${userId}: ${message}`);
      status = "SENT"; // Mark as sent for prototype dev without APIs
    }
  } catch (error) {
    console.error("Notification Error:", error);
    status = "FAILED";
  }

  // Record in DB
  await db.insert(notificationsTable).values({
    userId,
    title,
    type,
    channel: (resend || twilioClient) ? "external" : "in-app",
    status,
    message,
  });
}
