import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

// GET notifications
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const unreadOnly = searchParams.get("unread") === "true";

  const notifications = await prisma.notification.findMany({
    where: unreadOnly ? { isRead: false } : {},
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const unreadCount = await prisma.notification.count({ where: { isRead: false } });

  return NextResponse.json({ notifications, unreadCount });
}

// PATCH: mark notifications as read
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { ids, all } = body;

  if (all) {
    await prisma.notification.updateMany({ data: { isRead: true } });
  } else if (ids?.length) {
    await prisma.notification.updateMany({
      where: { id: { in: ids } },
      data: { isRead: true },
    });
  }

  return NextResponse.json({ ok: true });
}
