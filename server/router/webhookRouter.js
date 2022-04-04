const Router = require("koa-router");
// const customerModel = require("../../models/customerModel");
const trackModel = require("../../models/trackModel");
const prodcutModel = require("../../models/productModel");
const router = new Router({
  prefix: "/webhook",
});

function register(app) {
  router.post("/order-received", async (ctx) => {
    console.log("Hook Trigger");
    const order = ctx.request.body;
    if (!order.customer) {
      ctx.status = 200;
      ctx.body = { success: false, msg: "no customer" };
      return;
    }
    console.log("webhook order", order.source_name, order.customer.id);
    const customer_id = order.customer.id.toString();
    const products = await prodcutModel.find({});
    const tracks = await trackModel.find({});

    const resetProducts = ["7342578958577", "7342578565361"];
    var purchaseUpdate = {};
    var hasSupplements = false;
    var check_reset = 0;
    var customer = tracks.find((x) => x.customer_id === customer_id);
    products.forEach((product) => {
      purchaseUpdate = {
        ...purchaseUpdate,
        [product.product_id]: product.track,
      };
    });
    const line_items = order.line_items.map((item) => ({
      product_id: item.product_id.toString(),
      title: item.title,
      quantity: item.quantity,
    }));

    line_items.forEach((item) => {
      if (Object.keys(purchaseUpdate).includes(item.product_id)) {
        hasSupplements = true;
      }
      if (
        resetProducts.includes(item.product_id) &&
        item.total_discount === item.price
      ) {
        check_reset++;
      }
    });

    if (customer) {
      if (hasSupplements) {
        let dataToSave = {};
        for (let i = 0; i < line_items.length; i++) {
          const item = line_items[i];
          if (Object.keys(purchaseUpdate).includes(item.product_id)) {
            const history = {
              ...customer.history,
              [item.product_id + order.id]: [
                order.created_at,
                item.title,
                order.order_status_url,
                purchaseUpdate[item.product_id] * item.quantity,
              ],
            };
            dataToSave = {
              customer_id: customer_id,
              customer_email: order.customer.email,
              customer_name: `${order.customer.first_name} ${order.customer.last_name}`,
              track:
                customer.track +
                purchaseUpdate[item.product_id] * item.quantity,
              history: history,
            };
          }
        }
        await trackModel.findOneAndReplace(
          { customer_id: customer_id },
          dataToSave
        );
        customer = dataToSave;
      }
    } else if (hasSupplements) {
      let dataToSave = {};
      dataToSave.track = 0;
      line_items.forEach((item) => {
        if (Object.keys(purchaseUpdate).includes(item.product_id)) {
          dataToSave = {
            customer_id: customer_id,
            customer_email: order.customer.email,
            customer_name: `${order.customer.first_name} ${order.customer.last_name}`,
            track:
              dataToSave.track +
              purchaseUpdate[item.product_id] * item.quantity,
            history: {
              ...dataToSave.history,
              [item.product_id + order.id]: [
                order.created_at,
                item.title,
                order.order_status_url,
                purchaseUpdate[item.product_id] * item.quantity,
              ],
            },
          };
        }
      });
      console.log("dataToSave -- no customer", dataToSave);
      await trackModel.create(dataToSave);
    } else {
      const temp = {
        customer_id: customer_id,
        customer_email: order.customer.email,
        customer_name: `${order.customer.first_name} ${order.customer.last_name}`,
        track: 0,
        history: {
          [customer_id]: [
            order.customer.created_at,
            `${order.customer.first_name} ${order.customer.last_name}`,
            order.customer.email,
            "New Customer Added",
          ],
        },
      };
      console.log("new customer");
      await trackModel.create(temp);
    }
    if (check_reset >= 2) {
      check_reset = 0;
      const customer_history = customer.history;
      const current = customer.track;
      const update = await trackModel.findOneAndUpdate(
        { customer_id: customer_id },
        {
          customer_id: customer_id,
          customer_email: customer.customer_email,
          customer_name: customer.customer_name,
          track: current - 8,
          history: {
            ...customer_history,
            [order.id + customer_id]: [
              order.created_at,
              "Reset",
              order.order_status_url,
              current - 8,
            ],
          },
        },
        { new: true }
      );
      customer = update;
    }
    ctx.status = 200;
    ctx.body = { success: true };
  });

  app.use(router.routes());
  app.use(router.allowedMethods());
}

module.exports = register;
