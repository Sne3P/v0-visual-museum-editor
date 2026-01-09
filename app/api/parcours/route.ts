import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_API_URL || 'http://backend:5000';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const groupId = searchParams.get('group_id');

  if (!groupId) {
    return NextResponse.json({ error: 'Group ID is required' }, { status: 400 });
  }

  try {
    // Proxy vers le backend Flask PostgreSQL
    const response = await fetch(`${BACKEND_URL}/api/parcours/${groupId}`, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(error, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching parcours:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}