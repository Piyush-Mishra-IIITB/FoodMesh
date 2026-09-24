const mongoose = require("mongoose");
const DeliveryPartner = require("../models/deliveryPartnerModel");
const calculateDistance = require("../utils/distance");
const { redisClient } = require("../config/redis");
const crypto = require("crypto");
const { releaseLock } = require("../config/redisLock");
// CREATE DELIVERY PARTNER

const createDeliveryPartner = async (req, res) => {
  try {
    const { vehicleType, vehicleNumber, licenseNumber, currentLocation } =
      req.body;

    if (!vehicleType || !vehicleNumber || !licenseNumber) {
      return res.status(400).json({
        message: "Please provide all required fields",
      });
    }

    const existingPartner = await DeliveryPartner.findOne({
      user: req.user.userId,
    });

    if (existingPartner) {
      return res.status(400).json({
        message: "Delivery partner profile already exists",
      });
    }

    const deliveryPartner = await DeliveryPartner.create({
      user: req.user.userId,
      vehicleType,
      vehicleNumber,
      licenseNumber,
      currentLocation,
    });

    res.status(201).json({
      message: "Delivery partner created successfully",
      deliveryPartner,
    });
  } catch (error) {
    console.error(error);

    if (error.code === 11000) {
      return res.status(400).json({
        message: "Vehicle number or license number already exists",
      });
    }

    res.status(500).json({
      message: "Server error",
    });
  }
};
// GET OWN DELIVERY PARTNER PROFILE

const getDeliveryPartnerProfile = async (req, res) => {
  try {
    const deliveryPartner = await DeliveryPartner.findOne({
      user: req.user.userId,
    });

    if (!deliveryPartner) {
      return res.status(404).json({
        message: "Delivery partner profile not found",
      });
    }

    res.status(200).json({
      deliveryPartner,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server error",
    });
  }
};
// UPDATE ONLINE STATUS

const updateOnlineStatus = async (req, res) => {
  try {
    const { isOnline } = req.body;

    if (typeof isOnline !== "boolean") {
      return res.status(400).json({
        message: "isOnline must be true or false",
      });
    }

    const deliveryPartner = await DeliveryPartner.findOne({
      user: req.user.userId,
    });

    if (!deliveryPartner) {
      return res.status(404).json({
        message: "Delivery partner profile not found",
      });
    }

    deliveryPartner.isOnline = isOnline;

    // If partner goes offline, they cannot remain available
    if (!isOnline) {
      deliveryPartner.isAvailable = false;
    }

    await deliveryPartner.save();

    res.status(200).json({
      message: "Online status updated successfully",
      deliveryPartner,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server error",
    });
  }
};
// UPDATE AVAILABILITY

const updateAvailability = async (req, res) => {
  try {
    const { isAvailable } = req.body;

    if (typeof isAvailable !== "boolean") {
      return res.status(400).json({
        message: "isAvailable must be true or false",
      });
    }

    const deliveryPartner = await DeliveryPartner.findOne({
      user: req.user.userId,
    });

    if (!deliveryPartner) {
      return res.status(404).json({
        message: "Delivery partner profile not found",
      });
    }

    // Partner must be online to become available
    if (isAvailable && !deliveryPartner.isOnline) {
      return res.status(400).json({
        message: "You must be online to become available",
      });
    }

    deliveryPartner.isAvailable = isAvailable;

    await deliveryPartner.save();

    res.status(200).json({
      message: "Availability updated successfully",
      deliveryPartner,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server error",
    });
  }
};
// UPDATE CURRENT LOCATION

const updateLocation = async (req, res) => {
  try {
    const { latitude, longitude } = req.body;

    if (typeof latitude !== "number" || typeof longitude !== "number") {
      return res.status(400).json({
        message: "Latitude and longitude must be numbers",
      });
    }

    if (
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return res.status(400).json({
        message: "Invalid latitude or longitude",
      });
    }

    const deliveryPartner = await DeliveryPartner.findOne({
      user: req.user.userId,
    });

    if (!deliveryPartner) {
      return res.status(404).json({
        message: "Delivery partner profile not found",
      });
    }

    deliveryPartner.currentLocation = {
      latitude,
      longitude,
    };

    await deliveryPartner.save();

    res.status(200).json({
      message: "Location updated successfully",
      currentLocation: deliveryPartner.currentLocation,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server error",
    });
  }
};
// GET AVAILABLE DELIVERY PARTNERS
// Internal endpoint for Order Service

const getAvailablePartners = async (req, res) => {
  try {
    const partners = await DeliveryPartner.find({
      isOnline: true,
      isAvailable: true,
    }).select("_id user currentLocation rating totalDeliveries");

    res.status(200).json({
      count: partners.length,
      partners,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

// FIND NEAREST AVAILABLE DELIVERY PARTNER
// Internal endpoint for Order Service

const findNearestPartner = async (req, res) => {
  try {
    const { latitude, longitude } = req.body;

    if (typeof latitude !== "number" || typeof longitude !== "number") {
      return res.status(400).json({
        message: "Latitude and longitude must be numbers",
      });
    }

    const partners = await DeliveryPartner.find({
      isOnline: true,
      isAvailable: true,
      "currentLocation.latitude": { $exists: true },
      "currentLocation.longitude": { $exists: true },
    }).select("_id user currentLocation rating totalDeliveries");

    if (partners.length === 0) {
      return res.status(404).json({
        message: "No available delivery partners",
      });
    }

    let nearestPartner = null;
    let shortestDistance = Infinity;

    for (const partner of partners) {
      const distance = calculateDistance(
        latitude,
        longitude,
        partner.currentLocation.latitude,
        partner.currentLocation.longitude,
      );

      if (distance < shortestDistance) {
        shortestDistance = distance;
        nearestPartner = partner;
      }
    }

    res.status(200).json({
      partner: nearestPartner,
      distanceInKm: shortestDistance,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server error",
    });
  }
};
// ASSIGN DELIVERY PARTNER
// Internal endpoint for Order Service

const assignDeliveryPartner = async (req, res) => {
  const { partnerId } = req.body;

  if (!partnerId) {
    return res.status(400).json({
      message: "Partner ID is required",
    });
  }

  const lockKey = `lock:delivery-partner:${partnerId}`;
  const lockToken = crypto.randomUUID();

  try {
    // Try to acquire lock
    let lockAcquired;

    try {
      lockAcquired = await redisClient.set(lockKey, lockToken, {
        NX: true,
        EX: 10,
      });
    } catch (redisError) {
      console.error("Redis lock acquisition failed:", redisError.message);

      return res.status(503).json({
        message: "Delivery assignment temporarily unavailable",
      });
    }

    if (lockAcquired !== "OK") {
      return res.status(409).json({
        message: "Delivery partner is currently being assigned",
      });
    }

    // Critical section starts
    const deliveryPartner = await DeliveryPartner.findById(partnerId);

    if (!deliveryPartner) {
      return res.status(404).json({
        message: "Delivery partner not found",
      });
    }

    if (!deliveryPartner.isOnline || !deliveryPartner.isAvailable) {
      return res.status(400).json({
        message: "Delivery partner is not available",
      });
    }

    // Partner is now busy
    deliveryPartner.isAvailable = false;

    await deliveryPartner.save();

    // Critical section ends

    res.status(200).json({
      message: "Delivery partner assigned successfully",
      deliveryPartner,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server error",
    });
  } finally {
    try {
      await releaseLock(lockKey, lockToken);
    } catch (redisError) {
      console.error("Redis lock release failed:", redisError.message);
    }
  }
};
// RELEASE DELIVERY PARTNER
// Internal endpoint for Order Service

const releaseDeliveryPartner = async (req, res) => {
  try {
    const { partnerId } = req.body;

    if (!partnerId) {
      return res.status(400).json({
        message: "Partner ID is required",
      });
    }

    const deliveryPartner = await DeliveryPartner.findById(partnerId);

    if (!deliveryPartner) {
      return res.status(404).json({
        message: "Delivery partner not found",
      });
    }

    deliveryPartner.isAvailable = true;

    await deliveryPartner.save();

    res.status(200).json({
      message: "Delivery partner is available again",
      deliveryPartner,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server error",
    });
  }
};
// COMPLETE DELIVERY
// Internal endpoint for Order Service

const completeDelivery = async (req, res) => {
  try {
    const { partnerId } = req.body;

    if (!partnerId) {
      return res.status(400).json({
        message: "Partner ID is required",
      });
    }

    const deliveryPartner = await DeliveryPartner.findById(partnerId);

    if (!deliveryPartner) {
      return res.status(404).json({
        message: "Delivery partner not found",
      });
    }

    deliveryPartner.totalDeliveries += 1;
    deliveryPartner.isAvailable = true;

    await deliveryPartner.save();

    res.status(200).json({
      message: "Delivery completed successfully",
      deliveryPartner,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server error",
    });
  }
};
// GET DELIVERY PARTNER BY USER
// Internal endpoint for Order Service

const getPartnerByUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const deliveryPartner = await DeliveryPartner.findOne({
      user: userId,
    });

    if (!deliveryPartner) {
      return res.status(404).json({
        message: "Delivery partner not found",
      });
    }

    res.status(200).json({
      deliveryPartner: {
        id: deliveryPartner._id,
        user: deliveryPartner.user,
      },
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server error",
    });
  }
};
module.exports = {
  createDeliveryPartner,
  getDeliveryPartnerProfile,
  updateOnlineStatus,
  updateAvailability,
  updateLocation,
  getAvailablePartners,
  findNearestPartner,
  assignDeliveryPartner,
  releaseDeliveryPartner,
  completeDelivery,
  getPartnerByUser,
};
