const request = require("supertest");
const app = require("../app");
const { sequelize } = require("../model");
const { Job, Profile, Contract } = sequelize.models;
var contractor, client, contract;

describe("POST /balances/deposit/:userId", () => {
  beforeAll(async () => {
    await sequelize.sync({ force: true });
  });

  beforeEach(async () => {
    contractor = await Profile.create({
      firstName: "John",
      lastName: "Doe",
      profession: "Software Developer",
      balance: 0,
      type: "contractor",
    });
    client = await Profile.create({
      firstName: "Jane",
      lastName: "Doe",
      profession: "Project Manager",
      balance: 200,
      type: "client",
    });
    contract = await Contract.create({
      ContractorId: contractor.id,
      ClientId: client.id,
      terms: "Some terms",
      status: "new",
    });
    await Job.create({
      description: "Some job",
      price: 150,
      paid: false,
      paymentDate: null,
      ContractId: contract.id,
    });

    await Job.create({
      description: "Some job2",
      price: 250,
      paid: false,
      paymentDate: null,
      ContractId: contract.id,
    });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  test("should deposit funds into the user's balance", async () => {
    const res = await request(app)
      .post("/balances/deposit/" + client.id)
      .set("profile_id", client.id)
      .send({ amount: 100 });
    expect(res.statusCode).toBe(200);
    expect(res.body.profile.balance).toBe(300);
  });

  test("should not deposit funds if the maximum deposit amount is exceeded", async () => {
    const res = await request(app)
      .post("/balances/deposit/" + client.id)
      .set("profile_id", client.id)
      .send({ amount: 500 });
    expect(res.statusCode).toBe(400);
    const profile = await Profile.findByPk(1);
    expect(profile.balance).toBe(0);
  });

  test("should return an error if the user does not exist", async () => {
    const res = await request(app)
      .post("/balances/deposit/999")
      .set("profile_id", client.id)
      .send({ amount: 100 });
    console.log(res);
    expect(res.statusCode).toBe(400);
  });

  test("should return an error if an error occurs while updating the profile's balance", async () => {
    jest.spyOn(Profile.prototype, "save").mockImplementationOnce(() => {
      throw new Error("FAKE Database error");
    });
    const res = await request(app)
      .post("/balances/deposit/" + client.id)
      .set("profile_id", `${client.id}`)
      .send({ amount: 100 });
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe(
      "An error occurred while updating the profile's balance."
    );
  });
});
