const DeliveryPartner = require("../models/deliveryPartnerModel");
const calculateDistance = require("./distance");

const findNearestPartner = async (latitude, longitude) => {
  const partners = await DeliveryPartner.find({
    isOnline: true,
    isAvailable: true,
    "currentLocation.latitude": { $exists: true },
    "currentLocation.longitude": { $exists: true },
  });

  if (partners.length === 0) {
    return null;
  }

  let nearestPartner = null;
  let shortestDistance = Infinity;

  for (const partner of partners) {
    const partnerLatitude = partner.currentLocation.latitude;

    const partnerLongitude = partner.currentLocation.longitude;

    const distance = calculateDistance(
      latitude,
      longitude,
      partnerLatitude,
      partnerLongitude,
    );

    if (distance < shortestDistance) {
      shortestDistance = distance;
      nearestPartner = partner;
    }
  }

  return {
    partner: nearestPartner,
    distance: shortestDistance,
  };
};

module.exports = findNearestPartner;
