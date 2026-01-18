/**
 * Geographic utility functions for location-based calculations
 */

const EARTH_RADIUS_METERS = 6371000; // Earth's radius in meters

/**
 * Convert degrees to radians
 */
function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Calculate the Haversine distance between two geographic points
 * @param lat1 Latitude of first point in degrees
 * @param lng1 Longitude of first point in degrees
 * @param lat2 Latitude of second point in degrees
 * @param lng2 Longitude of second point in degrees
 * @returns Distance in meters
 */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
}

/**
 * Check if two points are within a given radius
 * @param lat1 Latitude of first point in degrees
 * @param lng1 Longitude of first point in degrees
 * @param lat2 Latitude of second point in degrees
 * @param lng2 Longitude of second point in degrees
 * @param radiusMeters Maximum distance in meters
 * @returns True if points are within radius
 */
export function isWithinRadius(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
  radiusMeters: number
): boolean {
  return haversineDistance(lat1, lng1, lat2, lng2) <= radiusMeters;
}

/**
 * Calculate the center point of multiple coordinates
 * @param points Array of {lat, lng} objects
 * @returns Center point {lat, lng}
 */
export function calculateCentroid(
  points: Array<{ lat: number; lng: number }>
): { lat: number; lng: number } {
  if (points.length === 0) {
    throw new Error('Cannot calculate centroid of empty array');
  }

  if (points.length === 1) {
    return { lat: points[0].lat, lng: points[0].lng };
  }

  // Convert to Cartesian coordinates for accurate centroid calculation
  let x = 0;
  let y = 0;
  let z = 0;

  for (const point of points) {
    const latRad = toRadians(point.lat);
    const lngRad = toRadians(point.lng);

    x += Math.cos(latRad) * Math.cos(lngRad);
    y += Math.cos(latRad) * Math.sin(lngRad);
    z += Math.sin(latRad);
  }

  const total = points.length;
  x /= total;
  y /= total;
  z /= total;

  // Convert back to lat/lng
  const lng = Math.atan2(y, x);
  const hyp = Math.sqrt(x * x + y * y);
  const lat = Math.atan2(z, hyp);

  return {
    lat: lat * (180 / Math.PI),
    lng: lng * (180 / Math.PI),
  };
}
