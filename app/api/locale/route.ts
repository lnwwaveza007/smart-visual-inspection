import {NextResponse} from "next/server";

export async function POST(request: Request) {
  try {
    const {locale} = await request.json();
    if (locale !== "th" && locale !== "en") {
      return NextResponse.json({error: "Invalid locale"}, {status: 400});
    }

    const res = NextResponse.json({ok: true});
    res.cookies.set("locale", locale, {
      path: "/",
      sameSite: "lax",
      httpOnly: false,
      maxAge: 60 * 60 * 24 * 365
    });
    return res;
  } catch (err) {
    return NextResponse.json({error: "Bad request"}, {status: 400});
  }
}

export function GET() {
  return NextResponse.json({error: "Method not allowed"}, {status: 405});
}


