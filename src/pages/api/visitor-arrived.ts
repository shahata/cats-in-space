import type { APIRoute } from "astro";
import { publisher } from "@wix/realtime";
import { members } from "@wix/members";
import { auth } from "@wix/essentials";

// All visitors subscribe to this channel on the home page; every arrival is
// broadcast to everyone currently watching.
const CHANNEL = { name: "visitor-arrivals" };

export const POST: APIRoute = async ({ request }) => {
  try {
    const { senderId } = await request.json().catch(() => ({}) as any);

    // Resolve the arriving visitor's identity. Anonymous visitors stay generic.
    let name: string | null = null;
    let photo: string | null = null;
    try {
      const res = await members.getCurrentMember({
        fieldsets: [members.Set.FULL],
      });
      if (res.member) {
        name =
          res.member.profile?.nickname ||
          res.member.contact?.firstName ||
          null;
        photo = res.member.profile?.photo?.url || null;
      }
    } catch {
      // Not logged in — fall through to a generic notification.
    }

    // Publishing requires the REALTIME_PUBLISH scope, which anonymous visitors
    // don't hold, so we elevate to the app identity for this single call.
    const elevatedPublish = auth.elevate(publisher.publish);
    await elevatedPublish(CHANNEL, {
      senderId: typeof senderId === "string" ? senderId : null,
      name,
      photo,
      isMember: Boolean(name),
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to announce arrival";
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
};
