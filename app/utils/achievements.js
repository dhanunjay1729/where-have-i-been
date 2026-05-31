/**
 * Travel Achievement System
 *
 * Computes badges/achievements based on the parsed travel stats and GeoJSON data.
 * Each achievement has: id, title, description, icon, rarity (common/rare/epic/legendary)
 */

const ACHIEVEMENT_DEFS = [
  // Distance achievements
  {
    id: "first_steps",
    title: "First Steps",
    description: "Tracked any travel data",
    icon: "👣",
    rarity: "common",
    check: () => true, // Always earned if we have data
  },
  {
    id: "century_rider",
    title: "Century Rider",
    description: "Traveled over 100 km",
    icon: "🚀",
    rarity: "common",
    check: (stats) => getDistanceKm(stats) >= 100,
  },
  {
    id: "thousand_miles",
    title: "Thousand Miles",
    description: "Traveled over 1,000 km",
    icon: "🌍",
    rarity: "rare",
    check: (stats) => getDistanceKm(stats) >= 1000,
  },
  {
    id: "globetrotter",
    title: "Globetrotter",
    description: "Traveled over 10,000 km",
    icon: "✈️",
    rarity: "epic",
    check: (stats) => getDistanceKm(stats) >= 10000,
  },
  {
    id: "around_the_world",
    title: "Around the World",
    description: "Traveled over 40,000 km (Earth circumference!)",
    icon: "🌎",
    rarity: "legendary",
    check: (stats) => getDistanceKm(stats) >= 40000,
  },
  // Places achievements
  {
    id: "explorer",
    title: "Explorer",
    description: "Visited 10+ unique places",
    icon: "🗺️",
    rarity: "common",
    check: (stats) => getPlacesCount(stats) >= 10,
  },
  {
    id: "wanderer",
    title: "Wanderer",
    description: "Visited 50+ unique places",
    icon: "🧭",
    rarity: "rare",
    check: (stats) => getPlacesCount(stats) >= 50,
  },
  {
    id: "nomad",
    title: "Digital Nomad",
    description: "Visited 200+ unique places",
    icon: "🎒",
    rarity: "epic",
    check: (stats) => getPlacesCount(stats) >= 200,
  },
  // Data density achievements
  {
    id: "data_collector",
    title: "Data Collector",
    description: "1,000+ data points recorded",
    icon: "📊",
    rarity: "common",
    check: (stats, geojson) => (geojson?.features?.length || 0) >= 1000,
  },
  {
    id: "data_hoarder",
    title: "Data Hoarder",
    description: "10,000+ data points recorded",
    icon: "💾",
    rarity: "rare",
    check: (stats, geojson) => (geojson?.features?.length || 0) >= 10000,
  },
  // Elevation achievements
  {
    id: "mountain_goat",
    title: "Mountain Goat",
    description: "Reached elevation above 2,000m",
    icon: "⛰️",
    rarity: "rare",
    check: (stats) => stats?.maxElevation > 2000,
  },
  {
    id: "peak_bagger",
    title: "Peak Bagger",
    description: "Over 5,000m elevation gain",
    icon: "🏔️",
    rarity: "epic",
    check: (stats) => stats?.totalElevationGain > 5000,
  },
  // Speed achievements
  {
    id: "speed_demon",
    title: "Speed Demon",
    description: "Average speed above 50 km/h",
    icon: "⚡",
    rarity: "rare",
    check: (stats) => stats?.avgSpeed > 50,
  },
  // Activity mode achievements
  {
    id: "multimodal",
    title: "Multimodal",
    description: "Used 3+ different travel modes",
    icon: "🔄",
    rarity: "rare",
    check: (stats) => (stats?.topTravelModes?.length || 0) >= 3,
  },
  {
    id: "road_warrior",
    title: "Road Warrior",
    description: "100+ driving segments",
    icon: "🚗",
    rarity: "rare",
    check: (stats) => {
      if (!stats?.topTravelModes) return false;
      const driving = stats.topTravelModes.find(
        (m) =>
          m.mode === "DRIVING" ||
          m.mode === "IN_PASSENGER_VEHICLE" ||
          m.mode === "IN_VEHICLE"
      );
      return driving && driving.count >= 100;
    },
  },
  {
    id: "walker",
    title: "Urban Walker",
    description: "50+ walking segments recorded",
    icon: "🚶",
    rarity: "common",
    check: (stats) => {
      if (!stats?.topTravelModes) return false;
      const walking = stats.topTravelModes.find(
        (m) => m.mode === "WALKING" || m.mode === "ON_FOOT"
      );
      return walking && walking.count >= 50;
    },
  },
];

function getDistanceKm(stats) {
  if (stats?.totalDistanceTraveledKm) return stats.totalDistanceTraveledKm;
  if (stats?.totalDistance) return stats.totalDistance;
  return 0;
}

function getPlacesCount(stats) {
  if (stats?.uniqueCitiesCount) return stats.uniqueCitiesCount;
  if (stats?.totalPlacesVisited) return stats.totalPlacesVisited;
  return 0;
}

const RARITY_ORDER = { legendary: 0, epic: 1, rare: 2, common: 3 };

/**
 * Compute which achievements have been earned.
 * @param {object} stats - parsed stats object
 * @param {object} geojson - parsed GeoJSON FeatureCollection
 * @returns {Array} earned achievements sorted by rarity (legendary first)
 */
export function computeAchievements(stats, geojson) {
  if (!stats) return [];

  const earned = [];
  for (const def of ACHIEVEMENT_DEFS) {
    try {
      if (def.check(stats, geojson)) {
        earned.push({
          id: def.id,
          title: def.title,
          description: def.description,
          icon: def.icon,
          rarity: def.rarity,
        });
      }
    } catch {
      // Skip achievements that error during check
    }
  }

  // Sort: legendary first
  earned.sort(
    (a, b) => (RARITY_ORDER[a.rarity] || 99) - (RARITY_ORDER[b.rarity] || 99)
  );

  return earned;
}

export const RARITY_COLORS = {
  common: { border: "border-neon-cyan/20", text: "text-neon-cyan", bg: "bg-neon-cyan/5" },
  rare: { border: "border-neon-blue/30", text: "text-neon-blue", bg: "bg-neon-blue/5" },
  epic: { border: "border-neon-purple/30", text: "text-neon-purple", bg: "bg-neon-purple/5" },
  legendary: { border: "border-neon-yellow/40", text: "text-neon-yellow", bg: "bg-neon-yellow/5" },
};
