import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/intel/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Body {
  address?: unknown;
  postcode?: unknown;
  guestCount?: unknown;
  bedrooms?: unknown;
  name?: unknown;
  result?: unknown;
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const address = typeof body.address === "string" ? body.address.trim() : "";
  const postcode = typeof body.postcode === "string" ? body.postcode.trim() : null;
  const guestCount = Number(body.guestCount);
  const bedrooms = Number.isFinite(Number(body.bedrooms)) ? Number(body.bedrooms) : null;
  const result = body.result;
  const nameInput = typeof body.name === "string" ? body.name.trim() : "";

  if (!address || !Number.isFinite(guestCount) || !result) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const name = nameInput.length > 0 ? nameInput : address.slice(0, 80);

  const { data, error } = await supabase
    .from("saved_searches")
    .insert({
      user_id: user.id,
      name,
      address,
      postcode,
      guest_count: guestCount,
      bedrooms,
      result,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ search: data });
}
