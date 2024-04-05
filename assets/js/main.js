// Function to log a message when a burger element is clicked
function handleBurgerClick() {
  console.log("Burger element clicked!");
  // hide burger element and show cross element
  const burger = document.querySelector(".burger");
  const cross = document.querySelector(".cross");
  const mobileMenu = document.querySelector(".mobile-menu");

  burger.style.display = "none";
  cross.style.display = "block";
  mobileMenu.style.display = "block";
}

function closeMobileMenu() {
  const burger = document.querySelector(".burger");
  const cross = document.querySelector(".cross");
  const mobileMenu = document.querySelector(".mobile-menu");

  burger.style.display = "block";
  cross.style.display = "none";
  mobileMenu.style.display = "none";
} 

document.addEventListener("DOMContentLoaded", function() {
  // Path: assets/js/main.js
  // Get the burger element
  const burger = document.querySelector(".burger");
  const cross = document.querySelector(".cross");

  // Add an event listener to the burger element
  burger.addEventListener("click", handleBurgerClick);
  cross.addEventListener("click", closeMobileMenu);
}); 