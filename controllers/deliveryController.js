const DeliveryPartner = require("../models/deliveryPartnerModel");
const User = require("../models/user");

// Create delivery partner profile
const createDeliveryPartner = async (req, res) => {
  try {
    const { vehicleType, vehicleNumber, licenseNumber } = req.body;

    if (!vehicleType || !vehicleNumber || !licenseNumber) {
      return res.status(400).json({
        message: "Please provide all required fields",
      });
    }

    // Make sure logged-in user is a delivery partner
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    if (user.role !== "delivery_partner") {
      return res.status(403).json({
        message: "User is not a delivery partner",
      });
    }

    // Prevent duplicate delivery profile
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
    });

    res.status(201).json({
      message: "Delivery partner created successfully",
      deliveryPartner,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

// Get delivery partner profile
const getDeliveryPartner = async (req, res) => {
  try {
    const deliveryPartner = await DeliveryPartner.findById(
      req.params.id,
    ).populate("user", "name email phone");

    if (!deliveryPartner) {
      return res.status(404).json({
        message: "Delivery partner not found",
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

// Update delivery partner
const updateDeliveryPartner = async (req, res) => {
  try {
    const deliveryPartner = await DeliveryPartner.findById(req.params.id);

    if (!deliveryPartner) {
      return res.status(404).json({
        message: "Delivery partner not found",
      });
    }

    // Only the owner of the profile or admin can update it
    if (
      req.user.role !== "admin" &&
      deliveryPartner.user.toString() !== req.user.userId
    ) {
      return res.status(403).json({
        message: "You are not allowed to update this profile",
      });
    }

    const {
      vehicleType,
      vehicleNumber,
      licenseNumber,
      isAvailable,
      isOnline,
      currentLocation,
    } = req.body;

    deliveryPartner.vehicleType = vehicleType ?? deliveryPartner.vehicleType;

    deliveryPartner.vehicleNumber =
      vehicleNumber ?? deliveryPartner.vehicleNumber;

    deliveryPartner.licenseNumber =
      licenseNumber ?? deliveryPartner.licenseNumber;

    deliveryPartner.isAvailable = isAvailable ?? deliveryPartner.isAvailable;

    deliveryPartner.isOnline = isOnline ?? deliveryPartner.isOnline;

    deliveryPartner.currentLocation =
      currentLocation ?? deliveryPartner.currentLocation;

    await deliveryPartner.save();

    res.status(200).json({
      message: "Delivery partner updated successfully",
      deliveryPartner,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server error",
    });
  }
};
// =====================================================
// UPDATE ONLINE STATUS
// =====================================================

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

    // If partner goes offline,
    // they should not be available for new orders.
    if (!isOnline) {
      deliveryPartner.isAvailable = false;
    }

    // If partner comes online,
    // make them available.
    if (isOnline) {
      deliveryPartner.isAvailable = true;
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

const updateCurrentLocation = async (req, res) => {
  try {
    const { latitude, longitude } = req.body;

    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({
        message: "Latitude and longitude are required",
      });
    }

    if (typeof latitude !== "number" || typeof longitude !== "number") {
      return res.status(400).json({
        message: "Latitude and longitude must be numbers",
      });
    }

    if (latitude < -90 || latitude > 90) {
      return res.status(400).json({
        message: "Invalid latitude",
      });
    }

    if (longitude < -180 || longitude > 180) {
      return res.status(400).json({
        message: "Invalid longitude",
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

    if (!deliveryPartner.isOnline) {
      return res.status(400).json({
        message: "You must be online to update your location",
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
module.exports = {
  createDeliveryPartner,
  getDeliveryPartner,
  updateDeliveryPartner,
  updateOnlineStatus,
  updateCurrentLocation,
};
