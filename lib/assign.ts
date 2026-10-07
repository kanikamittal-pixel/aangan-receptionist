export type Designer = { id: number; name: string; telegram_user_id: number | null; calendly_token: string | null; calendly_event_type_uri: string | null; calendly_timezone: string };

/**
 * THE designer-assignment rule. Single place to change.
 *
 * PENDING: Nikhil's rule has not been given. Until it is, the designer who tapped
 * "Take it forward" gets the lead. Do not add other logic here without confirmation.
 */
export function assignDesigner(_lead: { id: string; area?: string | null; property_type?: string | null }, tappedBy: Designer, _all: Designer[]): Designer {
  return tappedBy;
}
