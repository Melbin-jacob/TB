import { resolveAsOf } from '@/lib/data/asOf';
import { loadMarketData } from '@/lib/data/loader';
import { planShopping, PlanInputError } from '@/lib/engine/index';
import { planRequestSchema } from '@/lib/engine/requestSchema';

/**
 * POST /api/plan
 * Body:  { postalCode, restrictions?, items: [{ catalogItemId, quantity, unit }], asOf? }
 * 200:   PlanResponse & { asOf }
 * 400:   { error: "INVALID_JSON" | "INVALID_REQUEST", issues: [{ code?, path?, itemIndex?, message }] }
 * 500:   { error: "INTERNAL_ERROR", message }
 */

export const runtime = 'nodejs'; // the loader reads data/ from disk
export const dynamic = 'force-dynamic'; // "today" changes; never cache

function badRequest(error: 'INVALID_JSON' | 'INVALID_REQUEST', issues: object[]) {
  return Response.json({ error, issues }, { status: 400 });
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest('INVALID_JSON', [{ message: 'Request body must be valid JSON.' }]);
  }

  const parsed = planRequestSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(
      'INVALID_REQUEST',
      parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }

  const { asOf: requestedAsOf, ...planRequest } = parsed.data;
  try {
    const asOf = resolveAsOf(requestedAsOf, process.env.DEMO_AS_OF);
    const market = loadMarketData(asOf);
    const plan = planShopping(planRequest, market);
    return Response.json({ asOf, ...plan });
  } catch (e) {
    if (e instanceof PlanInputError) {
      return badRequest('INVALID_REQUEST', e.issues);
    }
    console.error('[api/plan] unexpected error', e);
    return Response.json({ error: 'INTERNAL_ERROR', message: 'Something went wrong while planning your trip.' }, { status: 500 });
  }
}
