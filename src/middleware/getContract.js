const { Op } = require("sequelize");

const getContractsForUser = async (req, res, next) => {
  const { Contract } = req.app.get("models");
  const clientId = req.profile.id;
  try {
    const contracts = await Contract.findAll({
      where: {
        [Op.or]: [{ ClientId: clientId }, { ContractorId: clientId }],
        status: { [Op.not]: "terminated" },
      },
      // include: [
      //   {
      //     model: req.app.get("models").Profile,
      //     as: "Client",
      //   },
      //   {
      //     model: req.app.get("models").Profile,
      //     as: "Contractor",
      //   },
      // ],
    });
    req.contracts = contracts; // store contracts in request object for later use
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

module.exports = { getContractsForUser };
