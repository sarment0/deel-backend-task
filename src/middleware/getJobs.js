const { Op } = require("sequelize");

const getJobsForUser = async (req, res, next) => {
  const { Contract, Job } = req.app.get("models");
  const clientId = req.get("profile_id");

  try {
    const jobs = await Job.findAll({
      include: [
        {
          model: Contract,
          where: {
            ClientId: clientId,
            status: { [Op.or]: ["in_progress", "new"] },
          },
        },
      ],
      where: {
        paid: { [Op.or]: [null, false] },
      },
    });
    req.jobs = jobs; // store jobs in request object for later use
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

module.exports = { getJobsForUser };
