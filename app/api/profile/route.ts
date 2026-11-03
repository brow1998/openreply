import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { getCurrentUserId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { checkPhotoDataUrl, checkUsername, profileUpdateSchema } from "@/lib/profile";

export interface ProfileResponse {
  name: string | null;
  username: string | null;
  email: string | null;
  image: string | null;
}

const select = { name: true, username: true, email: true, image: true } as const;

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: userId }, select });
  return NextResponse.json({ success: true, data: user satisfies ProfileResponse | null });
}

// Updates the signed-in user's own name, handle and photo.
export async function PATCH(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const parsed = profileUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }
  const { name, username, image } = parsed.data;
  const data: Prisma.UserUpdateInput = {};

  if (name !== undefined) data.name = name || null;

  if (username !== undefined) {
    if (username.trim() === "") {
      data.username = null;
    } else {
      const check = checkUsername(username);
      if (!check.ok) {
        return NextResponse.json({ success: false, error: `username_${check.error}` }, { status: 400 });
      }
      data.username = check.value;
    }
  }

  if (image !== undefined) {
    if (image === null) {
      data.image = null;
    } else {
      const check = checkPhotoDataUrl(image);
      if (!check.ok) {
        return NextResponse.json({ success: false, error: `photo_${check.error}` }, { status: 400 });
      }
      data.image = image;
    }
  }

  try {
    const user = await prisma.user.update({ where: { id: userId }, data, select });
    return NextResponse.json({ success: true, data: user satisfies ProfileResponse });
  } catch (err) {
    // The case-insensitive unique index on username.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ success: false, error: "username_taken" }, { status: 409 });
    }
    throw err;
  }
}
