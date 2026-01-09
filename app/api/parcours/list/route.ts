import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_API_URL || 'http://backend:5000';

export async function GET() {
  try {
    // Proxy vers le backend Flask PostgreSQL
    const response = await fetch(`${BACKEND_URL}/api/parcours`, {
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
    console.error('Error fetching parcours list:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}