// Turns raw realtor.ca listing fields into simple yes/no/unknown signals and a
// normalized record shape the UI renders from.

const PARKING_NEGATIVE_NAMES = ['No Garage', 'None'];

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/** yes | no | unknown */
function deriveParkingStatus(property) {
  if (!property) return 'unknown';
  const spaces = num(property.ParkingSpaceTotal);
  const parkingArr = Array.isArray(property.Parking) ? property.Parking : [];

  if (spaces !== null) {
    if (spaces > 0) return 'yes';
    if (spaces === 0 && parkingArr.length === 0) return 'no';
  }

  if (parkingArr.length > 0) {
    const hasPositive = parkingArr.some(p => !PARKING_NEGATIVE_NAMES.includes(p.Name));
    if (hasPositive) return 'yes';
    return 'no';
  }

  if (spaces === 0) return 'no';
  return 'unknown';
}

function normalizeOwnershipType(raw) {
  if (!raw || !String(raw).trim()) return 'Unknown';
  return raw;
}

function firstPhoto(property) {
  const photos = property && property.Photo;
  if (!Array.isArray(photos) || !photos.length) return null;
  return photos[0].MedResPath || photos[0].LowResPath || photos[0].HighResPath || null;
}

function parseAddress(property) {
  const text = property && property.Address && property.Address.AddressText;
  if (!text) return { street: '', cityLine: '' };
  const [street, cityLine] = text.split('|');
  return { street: (street || '').trim(), cityLine: (cityLine || '').trim() };
}

function priceInfo(property) {
  const display = property.Price || property.LeaseRent || null;
  const isRent = !!property.LeaseRent && !property.Price;
  const unformatted = num(property.PriceUnformattedValue ?? property.LeaseRentUnformattedValue);
  return { display, isRent, sortValue: unformatted };
}

// realtor.ca sends InsertedDateUTC as .NET DateTime ticks (100ns units since
// 0001-01-01). 621355968000000000 is the tick count at the Unix epoch.
const DOTNET_EPOCH_TICKS = 621355968000000000;

/** Days since the listing was inserted into realtor.ca, or null if undeterminable. */
function deriveDaysOnMarket(raw) {
  const ticks = num(raw.InsertedDateUTC);
  if (ticks === null) return null;
  const ms = (ticks - DOTNET_EPOCH_TICKS) / 10000;
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.floor((Date.now() - ms) / (1000 * 60 * 60 * 24)));
}

/** Builds the flat record the UI renders/filters from, out of one raw realtor.ca result. */
function buildListingRecord(raw) {
  const property = raw.Property || {};
  const building = raw.Building || {};
  const { street, cityLine } = parseAddress(property);
  const price = priceInfo(property);

  const searchableText = [
    street,
    cityLine,
    building.Type,
    property.Type,
    property.OwnershipType,
    raw.MlsNumber,
    raw.PublicRemarks,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return {
    id: raw.Id,
    mlsNumber: raw.MlsNumber,
    imageUrl: firstPhoto(property),
    street,
    cityLine,
    priceDisplay: price.display,
    isRent: price.isRent,
    priceSortValue: price.sortValue,
    beds: building.Bedrooms || null,
    baths: building.BathroomTotal || null,
    sqft: (building.FloorAreaMeasurements && building.FloorAreaMeasurements[0] && building.FloorAreaMeasurements[0].Area) || null,
    buildingType: building.Type || 'Unknown',
    ownershipType: normalizeOwnershipType(property.OwnershipType),
    parkingStatus: deriveParkingStatus(property),
    parkingType: property.ParkingType || null,
    detailsUrl: raw.RelativeDetailsURL ? `https://www.realtor.ca${raw.RelativeDetailsURL}` : null,
    insertedSortValue: num(raw.InsertedDateUTC),
    timeOnRealtor: raw.TimeOnRealtor || '',
    daysOnMarket: deriveDaysOnMarket(raw),
    searchableText,
    _raw: raw,
  };
}

window.RealtorFilters = { buildListingRecord, deriveParkingStatus };
